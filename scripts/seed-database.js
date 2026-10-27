
/**
 * Database seeding is disabled by default.
 *
 * This script intentionally does not connect to MongoDB,
 * delete records, create demo users, or generate random stock.
 *
 * Existing database records are preserved.
 */

console.log(
  'Database seeding is disabled. Existing users and blood-stock records were not changed.'
)

process.exitCode = 0















































// import mongoose from 'mongoose'
// import bcryptjs from 'bcryptjs'

// const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/blood-bank'

// const userSchema = new mongoose.Schema({
//   name: String,
//   email: { type: String, unique: true },
//   password: String,
//   role: { type: String, enum: ['Admin', 'Donor', 'Hospital'] },
//   bloodGroup: String,
//   hospitalName: String,
//   phone: String,
//   createdAt: { type: Date, default: Date.now },
// })

// const bloodStockSchema = new mongoose.Schema({
//   bloodGroup: { type: String, unique: true },
//   unitsAvailable: { type: Number, default: 0 },
//   lastUpdated: { type: Date, default: Date.now },
// })

// const User = mongoose.model('User', userSchema)
// const BloodStock = mongoose.model('BloodStock', bloodStockSchema)

// const bloodGroups = ['O+', 'O-', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-']

// async function seedDatabase() {
//   try {
//     await mongoose.connect(MONGODB_URI)
//     console.log('Connected to MongoDB')

//     // Clear existing data
//     await User.deleteMany({})
//     await BloodStock.deleteMany({})
//     console.log('Cleared existing data')

//     // Create demo users
//     const hashedPassword = await bcryptjs.hash('password123', 10)

//     const users = [
//       {
//         name: 'Admin User',
//         email: 'admin@example.com',
//         password: hashedPassword,
//         role: 'Admin',
//       },
//       {
//         name: 'John Donor',
//         email: 'donor@example.com',
//         password: hashedPassword,
//         role: 'Donor',
//         bloodGroup: 'O+',
//         phone: '+1-555-0001',
//       },
//       {
//         name: 'Jane Donor',
//         email: 'donor2@example.com',
//         password: hashedPassword,
//         role: 'Donor',
//         bloodGroup: 'A+',
//         phone: '+1-555-0002',
//       },
//       {
//         name: 'City Hospital',
//         email: 'hospital@example.com',
//         password: hashedPassword,
//         role: 'Hospital',
//         hospitalName: 'City Hospital',
//         phone: '+1-555-1000',
//       },
//       {
//         name: 'Central Medical Center',
//         email: 'hospital2@example.com',
//         password: hashedPassword,
//         role: 'Hospital',
//         hospitalName: 'Central Medical Center',
//         phone: '+1-555-1001',
//       },
//     ]

//     await User.insertMany(users)
//     console.log('Created demo users')

//     // Initialize blood stock
//     const stocks = bloodGroups.map((bg) => ({
//       bloodGroup: bg,
//       unitsAvailable: Math.floor(Math.random() * 50) + 10,
//     }))

//     await BloodStock.insertMany(stocks)
//     console.log('Initialized blood stock')

//     console.log('Database seeding completed successfully!')
//     console.log('\nDemo Credentials:')
//     console.log('Admin: admin@example.com / password123')
//     console.log('Donor: donor@example.com / password123')
//     console.log('Hospital: hospital@example.com / password123')

//     process.exit(0)
//   } catch (error) {
//     console.error('Error seeding database:', error)
//     process.exit(1)
//   }
// }

// seedDatabase()
