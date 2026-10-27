# Quick Setup Guide

## 1. Environment Setup

Create `.env.local`:
```env
MONGODB_URI=mongodb://localhost:27017/blood-bank
JWT_SECRET=your-secret-key-12345
```

For MongoDB Atlas, use:
```env
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/blood-bank
JWT_SECRET=your-secret-key-12345
```

## 2. Install Dependencies

```bash
pnpm install
```

## 3. Start MongoDB

Local MongoDB:
```bash
mongod
```

Or use MongoDB Atlas cloud service.

## 4. Seed Database (Optional)

```bash
# Run seed script
node scripts/seed-database.js
```

This creates demo users and initializes blood stock.

## 5. Run Development Server

```bash
pnpm dev
```

Visit: http://localhost:3000

## 6. Login with Demo Credentials

### Admin User
- Email: `admin@example.com`
- Password: `password123`
- Access: Full system administration

### Donor User
- Email: `donor@example.com`
- Password: `password123`
- Access: Donor dashboard

### Hospital User
- Email: `hospital@example.com`
- Password: `password123`
- Access: Hospital dashboard and blood requests

## Project Features

### Admin Dashboard (`/admin`)
- View system statistics
- Manage blood inventory (`/admin/blood-stock`)
- Approve/reject blood requests (`/admin/requests`)
- Manage users (`/admin/users`)

### Donor Dashboard (`/donor`)
- View profile and blood group
- See donation history
- View impact metrics

### Hospital Dashboard (`/hospital`)
- Request blood supplies
- Track request status
- View request history

## API Endpoints Summary

All requests require authentication token in cookie.

```
Authentication:
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET /api/auth/me

Blood Stock (Admin):
GET /api/blood-stock
PATCH /api/blood-stock

Blood Requests:
POST /api/blood-requests
GET /api/blood-requests
PATCH /api/blood-requests/:id

Users (Admin):
GET /api/users

Dashboard (Admin):
GET /api/dashboard/stats
```

## Database Collections

- **Users** - Stores admin, donor, and hospital users
- **BloodStock** - Inventory levels for each blood group
- **BloodRequests** - Blood requests from hospitals

## Security

- Passwords hashed with bcrypt
- JWT tokens in HTTP-only cookies
- Role-based access control
- 24-hour token expiration
- Protected API routes

## Troubleshooting

### Cannot connect to MongoDB
1. Verify MongoDB is running: `mongod`
2. Check MONGODB_URI in `.env.local`
3. For MongoDB Atlas, whitelist your IP

### Login not working
1. Clear browser cookies
2. Verify credentials from seed (or register new user)
3. Check console for error messages

### Blood request fails
1. Admin must initialize blood stock first
2. Hospital user must be logged in
3. Check if sufficient units available

## Next Steps

1. Customize colors in `app/globals.css`
2. Add email notifications
3. Set up scheduled donation reminders
4. Deploy to production
5. Configure MongoDB Atlas backups

## Resources

- Next.js Docs: https://nextjs.org/docs
- MongoDB Docs: https://docs.mongodb.com
- JWT Auth: https://jwt.io
- Tailwind CSS: https://tailwindcss.com

---

**Ready to go!** Start the development server with `pnpm dev` 🚀
