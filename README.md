# Blood Bank Management System

A full-stack blood bank management application built with Next.js, React, TypeScript, and MongoDB. The system helps administrators manage blood inventory, donors track their donation activity, and hospitals submit and track blood requests through role-based access control.

## Features

### Authentication and Authorization
- User registration and login
- Three roles: Admin, Donor, and Hospital
- Password hashing with bcrypt
- JWT-based authentication using HTTP-only cookies
- Role-based access control for protected pages and API routes

### Admin Dashboard
- Dashboard statistics and blood inventory overview
- Blood stock management
- Blood request review and approval or rejection
- User management and filtering
- Donation and blood issuance management
- Inventory movement tracking
- Dashboard charts and reporting

### Donor Features
- Donor profile and blood group information
- Donation appointment management
- Donation history
- Notifications and activity updates

### Hospital Features
- Submit blood requests with a specified blood group and quantity
- View request history
- Track request status
- View request approvals and issuance progress

### Inventory and Notifications
- Blood stock tracking
- Blood issuance records
- Inventory ledger for tracking stock movements
- Notifications and unread notification counts

## Technology Stack

| Component | Technology |
|---|---|
| Frontend | Next.js 16, React 19, TypeScript |
| Backend | Next.js API Routes, Node.js |
| Database | MongoDB |
| ODM | Mongoose |
| Authentication | JSON Web Tokens (JWT), bcrypt |
| Styling | Tailwind CSS |
| UI Components | shadcn/ui and Radix UI |
| Charts | Recharts |
| Validation | Zod |

## Prerequisites

Install the following before running the project:

- Node.js and npm
- MongoDB running locally or a MongoDB Atlas database
- Git (optional, for version control)

Use a Node.js version supported by your installed Next.js version.

## Installation and Setup

### 1. Install Dependencies

Open a terminal in the project directory and run:

```bash
npm install
```

Alternatively, if you use pnpm:

```bash
pnpm install
```

### 2. Configure Environment Variables

Create a `.env.local` file in the project root. Add your own MongoDB connection string and a strong, randomly generated JWT secret.

```env
MONGODB_URI=mongodb://localhost:27017/blood-bank
JWT_SECRET=replace-with-a-strong-random-secret
```

For MongoDB Atlas, use the connection string provided by your Atlas project instead of the local MongoDB URI.

**Security notes:**
- Never commit `.env.local` to Git.
- Do not share your database credentials or JWT secret.
- Use a separate database for automated tests.
- Configure production environment variables separately from local development settings.

### 3. Start MongoDB

If MongoDB is installed locally, ensure its service is running.

If you run MongoDB manually and `mongod` is available on your PATH, use:

```bash
mongod
```

For MongoDB Atlas, confirm that your database is accessible and that the required network access settings are configured.

### 4. Seed Demo Data (Optional)

The project includes a database seed script:

```bash
node scripts/seed-database.js
```

**Important:** Review the seed script before running it against any database containing existing records. Use a separate test database for demo data. Do not run the script against your live database unless you have verified its behavior and explicitly intend to modify that database.

Demo credentials, if configured by the seed script, should be verified from the script and database before use. Change any default passwords before deployment.

### 5. Start the Development Server

Run:

```bash
npm run dev
```

Or, with pnpm:

```bash
pnpm dev
```

Open:

[http://localhost:3000](http://localhost:3000)

### 6. Create a Production Build

To verify that the application compiles for production:

```bash
npm run build
```

To run the built application locally:

```bash
npm run start
```

Build the application before starting the production server.

## Application Routes

### Main Pages

| Route | Purpose |
|---|---|
| `/` | Login page |
| `/register` | User registration |
| `/admin` | Admin dashboard |
| `/admin/appointments` | Appointment management |
| `/admin/blood-stock` | Blood inventory |
| `/admin/donations` | Donation management |
| `/admin/requests` | Blood request management |
| `/admin/users` | User management |
| `/donor` | Donor dashboard |
| `/hospital` | Hospital dashboard |

Access to protected pages depends on the authenticated user's role and the application's authorization rules.

## API Endpoints

The application exposes API routes through Next.js.

### Authentication

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/register` | Register a user |
| POST | `/api/auth/login` | Authenticate a user |
| POST | `/api/auth/logout` | Log out a user |
| GET | `/api/auth/me` | Retrieve the current user's information |

### Appointments

| Method | Endpoint | Purpose |
|---|---|---|
| GET/POST | `/api/appointments` | Retrieve or create appointments |
| GET | `/api/appointments/slots` | Retrieve available appointment slots |
| GET/PATCH/DELETE* | `/api/appointments/:id` | Access or manage a specific appointment |

### Donations

| Endpoint | Purpose |
|---|---|
| `/api/donations` | Retrieve or create donation records |
| `/api/donations/:id` | Access or manage a specific donation |
| `/api/donor/stats` | Retrieve donor statistics |

### Blood Requests

| Endpoint | Purpose |
|---|---|
| `/api/blood-requests` | Retrieve or submit blood requests |
| `/api/blood-requests/:id` | Access or manage a specific blood request |

### Blood Stock and Issuance

| Endpoint | Purpose |
|---|---|
| `/api/blood-stock` | Retrieve or manage blood stock |
| `/api/blood-issuances` | Retrieve or create blood issuance records |
| `/api/blood-issuances/:id` | Access or manage a specific issuance |
| `/api/inventory-ledger` | Retrieve inventory movement records |

### Users, Dashboard, and Notifications

| Endpoint | Purpose |
|---|---|
| `/api/users` | User management |
| `/api/dashboard/stats` | Admin dashboard statistics |
| `/api/notifications` | Retrieve or create notifications |
| `/api/notifications/:id/read` | Mark a notification as read |
| `/api/notifications/mark-all-read` | Mark all notifications as read |
| `/api/notifications/unread-count` | Retrieve the unread notification count |
| `/api/health` | Health-check endpoint |

*The exact HTTP methods, permissions, and behavior for individual endpoints should be confirmed from their route handlers. This documentation is a route overview, not a replacement for the implementation.

## Database Overview

The application uses MongoDB with Mongoose. The following describes the main data concepts; actual fields and validation rules are defined by the project schemas.

### Users
Stores user account information, roles, and relevant donor or hospital details.

Typical fields may include:
- Name and email
- Hashed password
- Role: Admin, Donor, or Hospital
- Blood group and contact details, where applicable
- Created and updated timestamps

### Blood Stock
Tracks available quantities for each blood group and relevant inventory updates.

### Blood Requests
Stores hospital requests, requested blood groups and quantities, request status, and associated dates.

### Donations and Appointments
Tracks donor appointments and donation activity.

### Blood Issuances and Inventory Ledger
Records blood issuance activity and inventory movements to support stock tracking and accountability.

### Notifications
Stores notifications and read status for relevant application users.

Refer to the Mongoose schemas in `lib/` and the API route handlers for the exact database fields, relationships, and validation rules.

## Typical Workflows

### Admin Workflow
1. Log in using an authorized admin account.
2. Review dashboard statistics and blood stock.
3. Manage users and donation records.
4. Review hospital blood requests.
5. Approve or reject requests according to the implemented workflow.
6. Record or manage blood issuance as appropriate.
7. Review inventory movements and notifications.

### Donor Workflow
1. Register as a donor.
2. Log in to the donor dashboard.
3. Review profile and blood group information.
4. Manage appointments when available.
5. View donation history and notifications.

### Hospital Workflow
1. Register as a hospital.
2. Log in to the hospital dashboard.
3. Submit a blood request with the required blood group and quantity.
4. Track the request's status.
5. Review request history and issuance progress.

## Security Considerations

The application includes authentication and role-based access control. Before deployment, verify that:

- Passwords are stored as hashes, never as plaintext.
- JWT secrets are strong and kept outside version control.
- Authentication cookies use appropriate `HttpOnly`, `Secure`, and `SameSite` settings.
- Protected API routes validate both authentication and role permissions.
- Input is validated on the server.
- Sensitive error details and secrets are not exposed in API responses or logs.
- Database access is restricted to authorized services.
- Production credentials and test credentials are kept separate.

Security behavior should be confirmed against the current implementation and production configuration.

## Deployment

The application can be deployed to a compatible Node.js hosting platform, such as Vercel.

General deployment steps:

1. Review the source code and complete local testing.
2. Push the approved project files to a Git repository.
3. Import the repository into the hosting platform.
4. Configure `MONGODB_URI` and `JWT_SECRET` in the hosting platform's environment-variable settings.
5. Ensure the production database is configured securely and is separate from local test data.
6. Run the production build.
7. Deploy and verify authentication, role permissions, blood requests, stock management, donations, issuance, and notifications.

Never upload `.env.local`, database files, database backups, or private credentials to the repository.

## Troubleshooting

### MongoDB Connection Issues
- Confirm that MongoDB is running if using a local database.
- Verify the connection string without sharing its credentials.
- Check Atlas network access and database user permissions if using MongoDB Atlas.

### Authentication Issues
- Confirm that the required environment variables are configured.
- Check whether the login request succeeds and the authentication cookie is set correctly.
- Verify that the user's role has permission to access the requested page or API route.

### API Errors
- Check the browser's developer console and the server terminal.
- Review the relevant API route and its validation rules.
- Confirm that the database connection is available.

### Production Build Issues
Run:

```bash
npm run build
```

Review the first build error reported by the terminal. Deprecation warnings should be assessed separately from build failures.

## Future Enhancements

Possible future improvements include:
- Email notifications for important blood requests
- SMS alerts for urgent requests
- More detailed appointment scheduling
- Additional inventory and donation reports
- Two-factor authentication
- Blood compatibility assistance
- Exportable reports
- Real-time notifications

These are potential enhancements and should not be considered implemented unless they are present in the application.

## License

MIT

## Support

For issues, bugs, or questions, open an issue in the project's GitHub repository.

## Authors

**Avula Venkata Naga Venu**

Developed as a full-stack Blood Bank Management System project using Next.js, React, TypeScript, and MongoDB.

---

**Last Updated:** October 2026
