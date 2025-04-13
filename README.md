# Plytix to Lightspeed Integration

This repository contains a complete integration solution that connects Plytix PIM to Lightspeed e-commerce, enabling seamless product data synchronization between the two platforms.

## Repository Structure

- **frontend/** - React application for the user interface
- **backend/** - Node.js backend API server
- **landing-page/** - Static landing page for the website
- **.github/workflows/** - GitHub Actions workflow for automated deployment

## Key Features

- Secure API integration with both Plytix and Lightspeed
- Flexible attribute mapping between platforms
- Workflow filtering (only products with "4. Ready to be published" status)
- Scheduled synchronization
- User account system for managing multiple integrations
- Detailed reporting and logs

## Getting Started

### Prerequisites

- Node.js 14+ and npm
- MySQL database
- Plytix API credentials
- Lightspeed API credentials

### Installation

1. Clone this repository
2. Set up the database using the MySQL schema:
   ```bash
   mysql -u username -p database_name < backend/mysql_database_schema.sql
   ```
3. Configure environment variables:
   ```bash
   cp .env.example .env
   # Edit .env with your database and API credentials
   ```
4. Install backend dependencies:
   ```bash
   cd backend
   npm install
   ```
5. Install frontend dependencies:
   ```bash
   cd frontend
   npm install
   ```

### Development

To run the application in development mode:

1. Start the backend server:
   ```bash
   cd backend
   npm start
   ```
2. Start the frontend development server:
   ```bash
   cd frontend
   npm start
   ```

### Deployment

This repository includes GitHub Actions workflow for automated deployment to Plesk hosting. See the `.github/workflows/deploy.yml` file for details.

## Documentation

For more information, see the following documentation:

- [Technical Documentation](docs/technical_documentation.md)
- [User Guide](docs/user_guide.md)
- [Setup Instructions](docs/setup_instructions.md)

## License

This project is licensed under the MIT License - see the LICENSE file for details.
