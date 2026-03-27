import mongoose from "mongoose";

const MONGO_URI = process.env.MONGO_URI;

if (!MONGO_URI) {
    throw new Error("Please define the MONGO_URI environment variable");
}

// Use a different database name for this project
const DB_NAME = "amazon-ads";

interface MongooseCache {
    conn: typeof mongoose | null;
    promise: Promise<typeof mongoose> | null;
}

// Global cache to reuse connection across hot reloads in dev
const globalWithMongoose = globalThis as typeof globalThis & {
    _mongooseCache?: MongooseCache;
};

const cached: MongooseCache = globalWithMongoose._mongooseCache ?? {
    conn: null,
    promise: null,
};
globalWithMongoose._mongooseCache = cached;

export async function connectDB(): Promise<typeof mongoose> {
    if (cached.conn) return cached.conn;

    if (!cached.promise) {
        cached.promise = mongoose.connect(MONGO_URI!, {
            dbName: DB_NAME,
            bufferCommands: false,
        });
    }

    cached.conn = await cached.promise;
    console.log("[MongoDB] Connected to", DB_NAME);
    return cached.conn;
}
