
import mongoose, { type Mongoose } from 'mongoose'

const MONGODB_URI = process.env.MONGODB_URI

if (!MONGODB_URI) {
  throw new Error(
    'Please define the MONGODB_URI environment variable inside .env.local'
  )
}

interface MongooseCache {
  conn: Mongoose | null
  promise: Promise<Mongoose> | null
}

let cached: MongooseCache = global.mongooseCache as MongooseCache

if (!cached) {
  cached = global.mongooseCache = {
    conn: null,
    promise: null,
  }
}

export async function connectDB(): Promise<Mongoose> {
  if (cached.conn) {
    return cached.conn
  }

  if (!cached.promise) {
    const isProduction = process.env.NODE_ENV === 'production'

    const opts: mongoose.ConnectOptions = {
      bufferCommands: false,
      maxPoolSize: isProduction ? 10 : 20,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,

      // Preserve existing schema indexes.
      // Do not drop or reset existing database records.
      autoIndex: true,
    }

    cached.promise = mongoose
      .connect(MONGODB_URI!, opts)
      .then((connection) => connection)
  }

  try {
    cached.conn = await cached.promise
  } catch (error) {
    cached.promise = null
    throw error
  }

  return cached.conn
}

declare global {
  var mongooseCache:
    | {
        conn: Mongoose | null
        promise: Promise<Mongoose> | null
      }
    | undefined
}
