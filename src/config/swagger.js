import swaggerJsdoc from 'swagger-jsdoc';

const options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'Rayzer Lights Quotation API',
            version: '2.0.0',
            description: `
## Rayzer Lights Quotation Backend API

A high-performance backend service for managing products, customers, and quotations.

### Features
- **Product Management** - CRUD operations with bulk Excel upload
- **Customer Management** - Customer database with company info
- **Quotation/Bill System** - PDF generation with room-based grouping
- **Authentication** - JWT-based auth with role-based access control

### Performance Features
- Worker Threads for Excel parsing
- SSE streaming for large uploads (Cloudflare compatible)
- Bulk database inserts
- In-memory caching

### PDF Generation
- Landscape A4 format
- Room-based product grouping
- Product images support
- Rupee symbol (₹) with custom fonts
- Terms and conditions page
            `,
            contact: {
                name: 'Rayzer Lights',
                url: 'https://rayzerlights.com',
            },
        },
        servers: [
            {
                url: 'https://server.rayzerlights.com/api',
                description: 'Production server',
            },
            {
                url: 'http://localhost:4000/api',
                description: 'Development server',
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: 'http',
                    scheme: 'bearer',
                    bearerFormat: 'JWT',
                    description: 'Enter your JWT token',
                },
            },
            schemas: {
                Product: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer', description: 'Product ID' },
                        product: { type: 'string', description: 'Product name' },
                        color: { type: 'string' },
                        chipset: { type: 'string' },
                        type: { type: 'string' },
                        beam_angle: { type: 'string' },
                        ct: { type: 'string', description: 'Color temperature' },
                        cri: { type: 'string', description: 'Color Rendering Index' },
                        drive: { type: 'string' },
                        power_factor: { type: 'string' },
                        drive_details: { type: 'string' },
                        warranty: { type: 'string' },
                        dlp: { type: 'number', description: 'Dealer price' },
                        mrp: { type: 'number', description: 'MRP' },
                        image: { type: 'string', description: 'Image URL or base64' },
                    },
                },
                Customer: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        name: { type: 'string' },
                        email: { type: 'string', format: 'email' },
                        phone: { type: 'string' },
                        company_name: { type: 'string' },
                        address: { type: 'string' },
                        city: { type: 'string' },
                        state: { type: 'string' },
                        pincode: { type: 'string' },
                        gst_number: { type: 'string' },
                    },
                },
                Bill: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        bill_number: { type: 'string' },
                        customer_id: { type: 'integer' },
                        subtotal: { type: 'number' },
                        discount: { type: 'number' },
                        discount_percent: { type: 'number' },
                        tax_amount: { type: 'number' },
                        total_amount: { type: 'number' },
                        status: { 
                            type: 'string', 
                            enum: ['draft', 'sent', 'paid', 'cancelled'] 
                        },
                        items: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    product_id: { type: 'integer' },
                                    quantity: { type: 'integer' },
                                    unit_price: { type: 'number' },
                                    total_price: { type: 'number' },
                                    room_name: { type: 'string' },
                                },
                            },
                        },
                    },
                },
                User: {
                    type: 'object',
                    properties: {
                        id: { type: 'integer' },
                        email: { type: 'string', format: 'email' },
                        first_name: { type: 'string' },
                        last_name: { type: 'string' },
                        mobile_number: { type: 'string' },
                        role: { 
                            type: 'string', 
                            enum: ['admin', 'sales_staff'] 
                        },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        message: { type: 'string' },
                        status: { type: 'integer' },
                    },
                },
                UploadProgress: {
                    type: 'object',
                    description: 'SSE event for upload progress',
                    properties: {
                        type: { 
                            type: 'string', 
                            enum: ['start', 'progress', 'info', 'complete', 'error'] 
                        },
                        message: { type: 'string' },
                        percent: { type: 'integer' },
                        processed: { type: 'integer' },
                        total: { type: 'integer' },
                    },
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
        tags: [
            { name: 'Auth', description: 'Authentication endpoints' },
            { name: 'Users', description: 'User management' },
            { name: 'Products', description: 'Product catalog management' },
            { name: 'Customers', description: 'Customer management' },
            { name: 'Bills', description: 'Quotation/Bill management' },
            { name: 'Health', description: 'Health check endpoints' },
        ],
    },
    apis: ['./src/routes/*.js'], // Path to the API docs
};

const specs = swaggerJsdoc(options);

export default specs;
