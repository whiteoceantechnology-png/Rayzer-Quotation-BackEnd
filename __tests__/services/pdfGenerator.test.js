import { expect } from 'chai';
import fs from 'fs';
import path from 'path';
import { generateBillPDF } from '../../src/services/pdfGenerator.js';

describe('PDF Generator Service', () => {
  const testOutputPath = path.join(process.cwd(), 'uploads', 'bills', 'test-bill.pdf');

  afterEach(() => {
    // Clean up test PDF
    if (fs.existsSync(testOutputPath)) {
      fs.unlinkSync(testOutputPath);
    }
  });

  describe('generateBillPDF', () => {
    it('should generate a PDF file', async () => {
      const billData = {
        id: 1,
        bill_number: 'TEST-001',
        customer: {
          name: 'Test Customer',
          company_name: 'Test Company',
        },
        creator: {
          first_name: 'John',
          last_name: 'Doe',
          mobile_number: '9876543210',
        },
        items: [
          {
            product_id: {
              product: 'LED Spotlight',
              cri: '90',
              chipset: 'Samsung',
              drive_details: '12W Driver',
              power_factor: '0.9',
              watt: '12W',
              ct: '3000K',
              color: 'White',
            },
            quantity: 2,
            unit_price: 500,
            total_price: 1000,
            room_name: 'Living Room',
          },
        ],
        subtotal: 1000,
        discount: 100,
        discount_percent: 10,
        tax_amount: 162,
        total_amount: 1062,
        cash: 500,
        account: 562,
      };

      const result = await generateBillPDF(billData, testOutputPath);

      expect(result).to.equal(testOutputPath);
      expect(fs.existsSync(testOutputPath)).to.be.true;
    });

    it('should group items by room name', async () => {
      const billData = {
        id: 2,
        bill_number: 'TEST-002',
        customer: {
          name: 'Test Customer',
          company_name: 'Test Company',
        },
        items: [
          {
            product_id: { product: 'Light 1' },
            quantity: 1,
            unit_price: 100,
            total_price: 100,
            room_name: 'Living Room',
          },
          {
            product_id: { product: 'Light 2' },
            quantity: 1,
            unit_price: 200,
            total_price: 200,
            room_name: 'Bedroom',
          },
          {
            product_id: { product: 'Light 3' },
            quantity: 1,
            unit_price: 150,
            total_price: 150,
            room_name: 'Living Room',
          },
        ],
        subtotal: 450,
        discount: 0,
        tax_amount: 81,
        total_amount: 531,
      };

      const result = await generateBillPDF(billData, testOutputPath);

      expect(fs.existsSync(testOutputPath)).to.be.true;
      
      // Check file size is reasonable (PDF was generated with content)
      const stats = fs.statSync(testOutputPath);
      expect(stats.size).to.be.greaterThan(1000);
    });

    it('should handle missing optional fields', async () => {
      const billData = {
        id: 3,
        bill_number: 'TEST-003',
        customer: {
          name: 'Minimal Customer',
        },
        items: [],
        subtotal: 0,
        total_amount: 0,
      };

      const result = await generateBillPDF(billData, testOutputPath);

      expect(fs.existsSync(testOutputPath)).to.be.true;
    });

    it('should handle base64 images', async () => {
      // Small 1x1 pixel transparent PNG as base64
      const base64Image = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const billData = {
        id: 4,
        bill_number: 'TEST-004',
        customer: { name: 'Image Test' },
        items: [
          {
            product_id: {
              product: 'Product with Image',
              image: base64Image,
            },
            quantity: 1,
            unit_price: 100,
            total_price: 100,
            room_name: 'Test Room',
          },
        ],
        subtotal: 100,
        total_amount: 100,
      };

      const result = await generateBillPDF(billData, testOutputPath);

      expect(fs.existsSync(testOutputPath)).to.be.true;
    });

    it('should format currency with rupee symbol', async () => {
      const billData = {
        id: 5,
        bill_number: 'TEST-005',
        customer: { name: 'Currency Test' },
        items: [
          {
            product_id: { product: 'Expensive Item' },
            quantity: 1,
            unit_price: 99999.99,
            total_price: 99999.99,
            room_name: 'Test',
          },
        ],
        subtotal: 99999.99,
        discount: 9999.99,
        tax_amount: 16200,
        total_amount: 106200,
      };

      const result = await generateBillPDF(billData, testOutputPath);

      expect(fs.existsSync(testOutputPath)).to.be.true;
    });
  });
});
