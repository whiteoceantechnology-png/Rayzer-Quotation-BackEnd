# Rayzer Quotation Backend

Backend service for the Rayzer Quotation system, built with Node.js, Express, and MongoDB.

## Features

- **REST API** with Express.js
- **MongoDB** integration using Mongoose
- **Authentication** via Passport.js (JWT)
- **API Documentation** with Swagger (OpenAPI 3.0)
- **Linting & Formatting** with ESLint and Prettier

## Prerequisites

- [Node.js](https://nodejs.org/) (>= 18.17)
- [MongoDB](https://www.mongodb.com/) (running locally or a connection string)
- [npm](https://www.npmjs.com/) (or yarn/pnpm)

## Installation

1.  Clone the repository:
    ```bash
    git clone <repository-url>
    cd Rayzer-Quotation-BackEnd
    ```

2.  Install dependencies:
    ```bash
    npm install
    ```

3.  Configure Environment Variables:
    - Copy `.env.example` to `.env`
    - Update the variables in `.env` (DB URL, JWT Secret, etc.)

## Running the Application

### Development

To start the server in development mode with auto-reload (nodemon):

```bash
npm run dev
```

The server will start on `http://localhost:3000` (or the PORT defined in your .env).

### API Documentation

Swagger API documentation is available at:

[http://localhost:3000/api-docs](http://localhost:3000/api-docs)

### Production

To build and start for production:

```bash
npm start
```

## Project Structure

- `src/controllers` - Request handlers
- `src/models` - Mongoose schemas
- `src/routes` - API route definitions
- `src/services` - Business logic and external services
- `src/config` - Configuration files (database, passport, swagger)
- `src/utils` - Helper functions and logger

## License

MIT
