# Rayzer Lights Quotation API

A high-performance backend service for the Rayzer Lights quotation management system. Built with Node.js, Express, Sequelize ORM, and MariaDB.

## Features

### Core Features
- **REST API** with Express.js
- **MariaDB/MySQL** integration using Sequelize ORM
- **JWT Authentication** via Passport.js
- **Role-Based Access Control (RBAC)** - Admin, Sales Staff roles
- **API Documentation** with Swagger (OpenAPI 3.0)

### Product Management
- Product catalog with filtering and pagination
- Bulk Excel upload with **Worker Threads** for performance
- **Server-Sent Events (SSE)** for upload progress streaming
- Image support (file upload and base64)

### Quotation/Bill System
- Create quotations with multiple products
- **Room-based grouping** of products in bills
- **PDF Generation** with PDFKit
  - Custom fonts (Noto Sans) for ₹ rupee symbol support
  - Product images in quotations
  - Terms and conditions page
- Discount and tax calculations

### Customer Management
- Customer CRUD operations
- Company and contact information
- Quotation history per customer

### Performance Optimizations
- **Worker Threads** for CPU-intensive Excel parsing
- **Bulk Insert** (1000 rows/chunk) for large uploads
- **In-memory caching** for product lists
- **Rate Limiting** (500 API / 20 auth requests per 15 min)
- **Cloudflare compatible** SSE streaming

## Tech Stack

| Category | Technology |
|----------|------------|
| Runtime | Node.js 18+ |
| Framework | Express.js |
| Database | MariaDB / MySQL |
| ORM | Sequelize |
| Auth | Passport.js + JWT |
| PDF | PDFKit |
| Excel | ExcelJS |
| Process Manager | PM2 |
| CDN | Cloudflare |

## Prerequisites

- [Node.js](https://nodejs.org/) (>= 18.17)
- [MariaDB](https://mariadb.org/) or MySQL
- [pnpm](https://pnpm.io/) (recommended) or npm

## Installation

1. Clone the repository:
   ```bash
   git clone <repository-url>
   cd node-app
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

3. Configure Environment Variables:
   ```bash
   cp .env.example .env
   ```
   
   Update `.env` with your database credentials and JWT secret.

4. Set up fonts for PDF generation:
   ```bash
   mkdir -p uploads/fonts
   # Download Noto Sans fonts to uploads/fonts/
   # - NotoSans-Regular.ttf
   # - NotoSans-Bold.ttf
   ```

## Running the Application

### Development

```bash
pnpm dev
```

Server starts on `http://localhost:4000`

### Production

```bash
pnpm start
# or with PM2
pm2 start processes.json
```

### API Documentation

Swagger UI available at:
- **Production**: https://server.rayzerlights.com/api-docs
- **Development**: http://localhost:4000/api-docs

## Project Structure

```
src/
├── config/           # Configuration (database, swagger, middlewares)
├── controllers/      # Request handlers
│   ├── bill.controller.js
│   ├── customer.controller.js
│   ├── product.controller.js
│   └── productUpload.controller.js
├── middlewares/      # RBAC, auth middlewares
├── models/           # Sequelize models
├── routes/           # API route definitions
├── services/         # Business logic
│   ├── pdfGenerator.js    # PDF generation service
│   ├── cache.js           # In-memory cache
│   └── auth.js            # Authentication service
├── utils/            # Helpers (multer, logger)
├── workers/          # Worker threads
│   └── excelParser.worker.js
└── index.js          # App entry point

uploads/
├── bills/            # Generated PDF quotations
├── fonts/            # Custom fonts for PDF
└── products/         # Product images
```

## API Endpoints

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | User login |
| POST | `/api/auth/register` | User registration |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/products` | List products (paginated) |
| GET | `/api/products/all` | List all products (admin) |
| POST | `/api/products` | Create product |
| POST | `/api/products/upload` | Bulk upload via Excel (SSE) |
| PATCH | `/api/products/:id` | Update product |
| DELETE | `/api/products/:id` | Delete product |

### Bills/Quotations
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/bills` | List bills |
| POST | `/api/bills` | Create bill |
| GET | `/api/bills/:id` | Get bill details |
| GET | `/api/bills/:id/pdf` | Download PDF quotation |
| PATCH | `/api/bills/:id` | Update bill |
| DELETE | `/api/bills/:id` | Delete bill |

### Customers
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/customers` | List customers |
| POST | `/api/customers` | Create customer |
| GET | `/api/customers/:id` | Get customer details |
| PATCH | `/api/customers/:id` | Update customer |
| DELETE | `/api/customers/:id` | Delete customer |

## Excel Upload Format

The product upload accepts Excel files with these columns:

| Column | Required | Description |
|--------|----------|-------------|
| product | ✅ | Product name |
| color | | Color variant |
| chipset | | LED chipset |
| type | | Product type |
| beam_angle | | Beam angle |
| ct | | Color temperature |
| cri | | Color Rendering Index |
| drive | | Driver type |
| power_factor | | Power factor |
| drive_details | | Driver details |
| warranty | | Warranty period |
| dlp | | Dealer price |
| mrp | | MRP |
| image | | Image URL or base64 |

## PDF Generation Features

- **Landscape A4** format
- **Room-based grouping** - Products grouped by room name
- **Product images** - Supports file paths and base64
- **Rupee symbol** (₹) - Custom Noto Sans fonts
- **Auto page breaks** with header repetition
- **Outer border** wrapping content
- **Terms & Conditions** page

## Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 4000 |
| `NODE_ENV` | Environment | development |
| `DB_HOST` | Database host | localhost |
| `DB_PORT` | Database port | 3306 |
| `DB_NAME` | Database name | rayzer |
| `DB_USER` | Database user | - |
| `DB_PASS` | Database password | - |
| `JWT_SECRET` | JWT signing secret | - |
| `JWT_EXPIRATION` | Token expiration | 7d |

## Health Checks

| Endpoint | Description |
|----------|-------------|
| `/health` | Basic health check |
| `/health/ready` | Readiness probe (DB connected) |
| `/health/live` | Liveness probe |
| `/metrics` | Basic metrics |

## License

MIT
