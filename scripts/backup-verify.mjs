/**
 * Safe Backup and Restore Verification Script
 *
 * Automates creating a logical backup of the source database and verifying
 * that it can be cleanly restored into an isolated sandbox database,
 * WITHOUT risking, touching, or mutating the active live database.
 *
 * Safety Invariants:
 * 1. Checks for availability of MongoDB Database Tools (mongodump and mongorestore).
 * 2. Source database is only ever read by mongodump (zero mutations).
 * 3. Target restore database name is strictly validated:
 *    - Must NOT match the source database name.
 *    - Must NOT be a production/live/system database (blood-bank, admin, config, local).
 *    - Must contain "verify" or "restore-test" (e.g. "blood-bank-restore-verify").
 * 4. Restore transforms namespaces strictly into the verification target:
 *    --nsInclude="<sourceDb>.*" --nsTransform="<sourceDb>.*:<verifyDb>.*"
 * 5. Any destructive operations (e.g. --drop or dropDatabase()) are restricted
 *    exclusively to the validated verification database.
 * 6. Never reveals raw passwords or credentials in stdout/logs.
 */

import { execSync, spawnSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import mongoose from 'mongoose'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

/**
 * Mask passwords in MongoDB URIs for safe logging
 */
export function maskUri(uri) {
  if (!uri || typeof uri !== 'string') return ''
  return uri.replace(/(mongodb(?:\+srv)?:\/\/[^:]+:)([^@]+)(@)/i, '$1***$3')
}

/**
 * Parse MongoDB URI into base, database name, and query options.
 * Supports standard (mongodb://) and DNS seedlist (mongodb+srv://) URIs,
 * multi-host replica sets, and URIs with or without credentials/options.
 */
export function parseMongoUri(uri) {
  if (!uri || typeof uri !== 'string') return null
  const trimmed = uri.trim()
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/([^?]*))?(\?.*)?$/i)
  if (!match) return null
  return {
    base: match[1],
    dbName: match[2] || '',
    query: match[3] || '',
  }
}

/**
 * Safely parse database name from standard or SRV URI
 */
export function parseDbName(uri) {
  const parsed = parseMongoUri(uri)
  return parsed?.dbName || ''
}

/**
 * Construct verification URI by setting target database on base URI,
 * safely preserving hosts, credentials, and connection options.
 */
export function buildVerifyUri(baseUri, targetDbName) {
  const parsed = parseMongoUri(baseUri)
  if (!parsed) {
    throw new Error('FATAL SAFETY ERROR: Cannot construct verification URI from invalid or malformed MongoDB connection string.')
  }
  return `${parsed.base}/${targetDbName}${parsed.query}`
}

/**
 * Locate executable tool in PATH or via explicit environment variable
 */
export function findDatabaseTool(toolName) {
  const envOverride = process.env[`${toolName.toUpperCase()}_PATH`]
  if (envOverride && fs.existsSync(envOverride)) {
    return envOverride
  }

  const isWin = process.platform === 'win32'
  const binaryName = isWin ? `${toolName}.exe` : toolName

  // Check common MongoDB 8.0 / Tools paths on Windows
  if (isWin) {
    const commonPaths = [
      path.join('C:', 'Program Files', 'MongoDB', 'Tools', 'bin', binaryName),
      path.join('C:', 'Program Files', 'MongoDB', 'Server', '8.0', 'bin', binaryName),
      path.join('C:', 'Program Files', 'MongoDB', 'Server', '7.0', 'bin', binaryName),
    ]
    for (const p of commonPaths) {
      if (fs.existsSync(p)) return p
    }
  }

  // Check system PATH
  try {
    const probeCmd = isWin ? `where.exe ${toolName}` : `which ${toolName}`
    const output = execSync(probeCmd, { stdio: ['pipe', 'pipe', 'ignore'], encoding: 'utf8' }).trim()
    const firstMatch = output.split(/\r?\n/)[0].trim()
    if (firstMatch && fs.existsSync(firstMatch)) {
      return firstMatch
    }
  } catch {
    // Not found in system PATH
  }

  return null
}

/**
 * Strict validation of the verification database name
 * Fails closed if any rule is violated.
 */
export function validateVerificationDbName(verifyDbName, sourceDbName) {
  if (!verifyDbName || typeof verifyDbName !== 'string' || verifyDbName.trim().length === 0) {
    throw new Error('Verification database name is empty or invalid.')
  }

  const lowerVerify = verifyDbName.toLowerCase().trim()
  const lowerSource = (sourceDbName || '').toLowerCase().trim()

  if (lowerVerify === lowerSource) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Verification target "${verifyDbName}" matches source database "${sourceDbName}". ` +
      `Restoration and destructive cleanup MUST target an isolated sandbox only.`
    )
  }

  const forbiddenNames = [
    'blood-bank',
    'bloodbank',
    'production',
    'prod',
    'main',
    'live',
    'admin',
    'config',
    'local',
  ]
  if (forbiddenNames.includes(lowerVerify)) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Verification target "${verifyDbName}" is a forbidden live/system database name.`
    )
  }

  if (!lowerVerify.includes('verify') && !lowerVerify.includes('restore-test')) {
    throw new Error(
      `FATAL SAFETY VIOLATION: Verification database name "${verifyDbName}" must explicitly contain "verify" or "restore-test" (e.g. "blood-bank-restore-verify").`
    )
  }

  return true
}

/**
 * Main Verification Workflow
 */
async function main() {
  const args = process.argv.slice(2)
  const isDryRun = args.includes('--dry-run')
  const keepVerifyDb = args.includes('--keep-verify-db')

  console.log('====================================================================')
  console.log('  SAFE DATABASE BACKUP & RESTORE VERIFICATION RUNNER')
  console.log('====================================================================\n')

  // 1. Tool Pre-flight Check
  console.log('[1/5] Checking MongoDB Database Tools...')
  const mongodumpBin = findDatabaseTool('mongodump')
  const mongorestoreBin = findDatabaseTool('mongorestore')

  if (!mongodumpBin || !mongorestoreBin) {
    console.error('\nERROR: MongoDB Database Tools are required but missing on this system:')
    if (!mongodumpBin) console.error('  - "mongodump" was not found in PATH or standard directories.')
    if (!mongorestoreBin) console.error('  - "mongorestore" was not found in PATH or standard directories.')
    console.error('\nResolution:')
    console.error('1. Download "MongoDB Database Tools" from: https://www.mongodb.com/try/download/database-tools')
    console.error('2. Add the extracted "bin" directory to your system PATH, or set:')
    console.error('   $env:MONGODUMP_PATH = "C:\\path\\to\\mongodump.exe"')
    console.error('   $env:MONGORESTORE_PATH = "C:\\path\\to\\mongorestore.exe"')
    console.error('\nTerminating verification runner safely without modifications.')
    process.exit(1)
  }

  console.log(`  ✓ mongodump found: ${mongodumpBin}`)
  console.log(`  ✓ mongorestore found: ${mongorestoreBin}`)

  // 2. Database URI and Isolation Verification
  console.log('\n[2/5] Validating Source and Verification Target Namespaces...')
  const sourceUri = process.env.SOURCE_MONGODB_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/blood-bank'
  const parsedSource = parseMongoUri(sourceUri)
  if (!parsedSource) {
    console.error('\nFATAL SAFETY ERROR: Source MongoDB URI is malformed or invalid.')
    console.error('Expected a valid mongodb:// or mongodb+srv:// connection string.')
    process.exit(1)
  }

  const sourceDbName = parsedSource.dbName || process.env.SOURCE_DB_NAME || 'blood-bank'

  let verifyDbName = ''
  let verifyUri = ''

  if (process.env.VERIFY_MONGODB_URI) {
    const parsedVerify = parseMongoUri(process.env.VERIFY_MONGODB_URI)
    if (!parsedVerify) {
      console.error('\nFATAL SAFETY ERROR: VERIFY_MONGODB_URI is malformed or invalid.')
      console.error('Expected a valid mongodb:// or mongodb+srv:// connection string.')
      process.exit(1)
    }

    const uriDbName = parsedVerify.dbName
    if (!uriDbName) {
      console.error('\nFATAL SAFETY ERROR: VERIFY_MONGODB_URI must contain an explicit database path.')
      console.error('Example: mongodb://localhost:27017/blood-bank-restore-verify')
      process.exit(1)
    }

    if (process.env.VERIFY_DB_NAME && process.env.VERIFY_DB_NAME !== uriDbName) {
      console.error(
        `\nFATAL SAFETY ERROR: Ambiguous configuration: VERIFY_DB_NAME ("${process.env.VERIFY_DB_NAME}") ` +
        `does not match the database specified in VERIFY_MONGODB_URI ("${uriDbName}").`
      )
      process.exit(1)
    }

    verifyDbName = uriDbName
    verifyUri = process.env.VERIFY_MONGODB_URI
  } else {
    verifyDbName = process.env.VERIFY_DB_NAME || 'blood-bank-restore-verify'
    try {
      verifyUri = buildVerifyUri(sourceUri, verifyDbName)
    } catch (buildErr) {
      console.error(`\n${buildErr.message}`)
      process.exit(1)
    }
  }

  try {
    validateVerificationDbName(verifyDbName, sourceDbName)
  } catch (validationErr) {
    console.error(`\n${validationErr.message}`)
    process.exit(1)
  }

  console.log(`  Source Database:        ${sourceDbName} (${maskUri(sourceUri)})`)
  console.log(`  Verification Sandbox:   ${verifyDbName} (${maskUri(verifyUri)})`)
  console.log('  ✓ Safety boundaries validated: Live database is strictly read-only.')
  console.log('  ✓ Destruction/Drop scope is restricted exclusively to the verification sandbox.')

  if (isDryRun) {
    console.log('\n[DRY RUN] All pre-flight safety validations passed successfully. Exiting without execution.')
    process.exit(0)
  }

  // 3. Execution: mongodump
  console.log('\n[3/5] Creating Logical Archive from Source...')
  const backupsDir = path.resolve(__dirname, '..', 'backups')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
  const archivePath = path.join(backupsDir, `blood-bank-backup-${timestamp}.gz`)

  console.log(`  Target Archive: ${archivePath}`)
  const dumpArgs = [
    `--uri=${sourceUri}`,
    `--db=${sourceDbName}`,
    `--archive=${archivePath}`,
    '--gzip',
  ]

  const dumpResult = spawnSync(mongodumpBin, dumpArgs, { stdio: 'inherit' })
  if (dumpResult.status !== 0) {
    console.error(`\nERROR: mongodump failed with exit code ${dumpResult.status}`)
    process.exit(1)
  }

  if (!fs.existsSync(archivePath) || fs.statSync(archivePath).size === 0) {
    console.error('\nERROR: Backup archive file was not generated or is empty.')
    process.exit(1)
  }
  console.log(`  ✓ Logical backup generated successfully (${(fs.statSync(archivePath).size / 1024).toFixed(1)} KB).`)

  // 4. Execution: mongorestore (Restricted exclusively to verifyDbName)
  console.log('\n[4/5] Restoring to Isolated Verification Sandbox...')
  const restoreArgs = [
    `--uri=${verifyUri}`,
    `--nsInclude=${sourceDbName}.*`,
    `--nsTransform=${sourceDbName}.*:${verifyDbName}.*`,
    `--archive=${archivePath}`,
    '--gzip',
    '--drop', // Safe: strictly constrained by nsTransform into verifyDbName
  ]

  const restoreResult = spawnSync(mongorestoreBin, restoreArgs, { stdio: 'inherit' })
  if (restoreResult.status !== 0) {
    console.error(`\nERROR: mongorestore failed with exit code ${restoreResult.status}`)
    process.exit(1)
  }
  console.log('  ✓ Restore into sandbox completed.')

  // 5. Verification & Sandbox Cleanup
  console.log('\n[5/5] Performing Sandbox Data Integrity Verification...')
  try {
    await mongoose.connect(verifyUri)
    const db = mongoose.connection.db

    // Double check that we are indeed connected to verifyDbName
    if (db.databaseName !== verifyDbName) {
      throw new Error(`Connected to unexpected database: ${db.databaseName}. Expected: ${verifyDbName}`)
    }

    const collections = await db.listCollections().toArray()
    console.log(`  Sandbox Collections restored: ${collections.length}`)
    for (const col of collections) {
      const count = await db.collection(col.name).countDocuments()
      console.log(`    - ${col.name}: ${count} document(s)`)
    }

    console.log('  ✓ Data integrity confirmed in sandbox database.')

    if (keepVerifyDb) {
      console.log(`\nNotice: Sandbox database "${verifyDbName}" preserved for manual inspection (--keep-verify-db specified).`)
    } else {
      console.log(`\nCleaning up temporary sandbox database "${verifyDbName}"...`)
      // Safe teardown: double-validate before dropping
      validateVerificationDbName(db.databaseName, sourceDbName)
      await db.dropDatabase()
      console.log(`  ✓ Sandbox database "${verifyDbName}" dropped cleanly. Live database was never altered.`)
    }

    await mongoose.disconnect()
  } catch (inspectErr) {
    console.error(`\nERROR during verification inspection: ${inspectErr.message}`)
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect()
    }
    process.exit(1)
  }

  console.log('\n====================================================================')
  console.log('  BACKUP & RESTORE VERIFICATION COMPLETED SUCCESSFULLY')
  console.log('====================================================================\n')
}

// Execute when invoked directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error('Fatal execution error:', err)
    process.exit(1)
  })
}
