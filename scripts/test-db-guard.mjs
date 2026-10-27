/**
 * Test Database Safety Guardrail
 *
 * Enforces that test scripts can ONLY connect to an explicitly configured
 * isolated test database via TEST_MONGODB_URI.
 *
 * Safety Invariants:
 * 1. TEST_MONGODB_URI must be provided.
 * 2. Parses the target database name from the connection URI.
 * 3. Strictly rejects the live 'blood-bank' database.
 * 4. Strictly requires that the database name contains 'test' (e.g. 'blood-bank-test').
 * 5. Aborts process immediately with an informative error if validation fails.
 */
/**
 * Parse MongoDB URI into base, database name, and query options.
 * Supports standard (mongodb://) and DNS seedlist (mongodb+srv://) URIs,
 * multi-host replica sets, and URIs with or without credentials/options.
 */
export function parseMongoDbName(uri) {
  if (!uri || typeof uri !== 'string') return ''
  const trimmed = uri.trim()
  const match = trimmed.match(/^(mongodb(?:\+srv)?:\/\/[^/?]+)(?:\/([^/?]+))?(\?.*)?$/i)
  if (!match) return ''
  return match[2] || ''
}

export function getSafeTestDbUri() {
  const uri = process.env.TEST_MONGODB_URI

  if (!uri || typeof uri !== 'string' || uri.trim().length === 0) {
    console.error('\n====================================================================')
    console.error('FATAL TEST SAFETY ERROR: Missing TEST_MONGODB_URI environment variable.')
    console.error('Test scripts perform database mutations and are strictly prohibited')
    console.error('from running against unverified or live databases.')
    console.error('Please specify an explicit isolated test database:')
    console.error('  TEST_MONGODB_URI="mongodb://localhost:27017/blood-bank-test"')
    console.error('====================================================================\n')
    process.exit(1)
  }

  // Parse and validate database name from URI
  const dbName = parseMongoDbName(uri)

  if (!dbName) {
    console.error('\n====================================================================')
    console.error('FATAL TEST SAFETY ERROR: Could not parse database name from TEST_MONGODB_URI.')
    console.error('Target URI must specify an explicit database path (e.g. /blood-bank-test).')
    console.error('Bare host URIs, malformed connection strings, and trailing slashes without a database name are rejected.')
    console.error('====================================================================\n')
    process.exit(1)
  }

  const lowerDb = dbName.toLowerCase()

  // Reject the live production/development database 'blood-bank'
  if (lowerDb === 'blood-bank' || lowerDb === 'bloodbank' || lowerDb === 'production') {
    console.error('\n====================================================================')
    console.error(`FATAL TEST SAFETY ERROR: Target database "${dbName}" is the LIVE application database!`)
    console.error('Executing test scripts against the live database is strictly forbidden.')
    console.error('Target URI must point to a dedicated test database (e.g. blood-bank-test).')
    console.error('====================================================================\n')
    process.exit(1)
  }

  // Enforce that test database name explicitly contains 'test'
  if (!lowerDb.includes('test')) {
    console.error('\n====================================================================')
    console.error(`FATAL TEST SAFETY ERROR: Database name "${dbName}" does not contain "test".`)
    console.error('To prevent accidental corruption of staging or production databases,')
    console.error('the database name in TEST_MONGODB_URI must contain "test" (e.g. blood-bank-test).')
    console.error('====================================================================\n')
    process.exit(1)
  }

  return uri.trim()
}
