# Jest Setup for POST /api/products with Multer and ImageKit

## Overview
This guide explains the Jest testing setup for the POST /api/products endpoint with image upload using Multer and ImageKit.

## Project Structure
```
product/
├── src/
│   ├── app.js
│   ├── controllers/
│   │   └── product.controller.js
│   ├── middleware/
│   │   └── multer.middleware.js
│   └── routes/
│       └── product.routes.js
├── __tests__/
│   ├── setup.js
│   └── routes/
│       └── product.post.test.js
├── jest.config.js
└── package.json
```

## Installation

All dependencies are already installed:
```bash
npm install imagekit multer express supertest jest --save-dev
```

## Configuration Files

### 1. jest.config.js
Configures Jest with Node environment, test timeout, and coverage thresholds.

### 2. __tests__/setup.js
Sets up environment variables for testing:
- `IMAGEKIT_PUBLIC_KEY`
- `IMAGEKIT_PRIVATE_KEY`
- `IMAGEKIT_URL_ENDPOINT`

## Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run specific test file
npm test -- __tests__/routes/product.post.test.js

# Run tests matching pattern
npm test -- --testNamePattern="should create a product"
```

## Test File Structure

The test suite includes comprehensive test cases for the POST /api/products endpoint:

### Test Categories:

1. **Successful Product Creation**
   - Creating product with valid data and image
   - Verifying 201 status code
   - Checking timestamp inclusion

2. **Missing Required Fields**
   - Testing validation for: name, description, price, category
   - Verifying 400 status codes
   - Checking error messages

3. **Missing Image File**
   - Verifying image is required
   - Checking appropriate error response

4. **Price Validation**
   - Converting string to number
   - Handling decimal prices
   - Testing numeric precision

5. **ImageKit Integration**
   - Mocking ImageKit upload
   - Verifying upload parameters
   - Handling upload errors

6. **Response Structure**
   - Verifying response contains success flag
   - Checking data object structure
   - Validating all returned fields

7. **Edge Cases**
   - Special characters in product name
   - Very long descriptions
   - Zero and negative prices
   - Empty string values

## Mocking Strategy

### ImageKit Mock
```javascript
jest.mock('imagekit', () => ({
	default: jest.fn(),
}));
```

### Multer Middleware Mock
```javascript
jest.mock('../../src/middleware/multer.middleware', () => {
	return {
		single: jest.fn(() => (req, res, next) => {
			next();
		}),
	};
});
```

## API Endpoint

**Endpoint:** `POST /api/products`

**Request:**
- **Content-Type:** multipart/form-data
- **Fields:**
  - `name` (string, required): Product name
  - `description` (string, required): Product description
  - `price` (number/string, required): Product price
  - `category` (string, required): Product category
  - `image` (file, required): Product image file

**Response (Success - 201):**
```json
{
	"success": true,
	"message": "Product created successfully",
	"data": {
		"name": "Product Name",
		"description": "Product Description",
		"price": 99.99,
		"category": "Category",
		"image": {
			"url": "https://ik.imagekit.io/...",
			"fileId": "file-123",
			"publicUrl": "https://ik.imagekit.io/..."
		},
		"createdAt": "2024-01-01T12:00:00.000Z"
	}
}
```

**Response (Error - 400):**
```json
{
	"success": false,
	"message": "Missing required fields: name, description, price, category"
}
```

**Response (Error - 500):**
```json
{
	"success": false,
	"message": "Error creating product",
	"error": "Error message details"
}
```

## Environment Variables

Create a `.env` file in the project root:
```
IMAGEKIT_PUBLIC_KEY=your_public_key
IMAGEKIT_PRIVATE_KEY=your_private_key
IMAGEKIT_URL_ENDPOINT=https://ik.imagekit.io/your_id
NODE_ENV=development
```

## Coverage Report

To generate a coverage report:
```bash
npm run test:coverage
```

Coverage thresholds are set at 50% for all metrics (branches, functions, lines, statements).

## Debugging Tests

Enable debug logging:
```bash
npm test -- --verbose
```

With file logging:
```bash
npm test > test_results.log 2>&1
```

## Common Issues

### Issue 1: Module not found
**Solution:** Check relative paths in imports. The test file is at `__tests__/routes/`, so use `../../src/` to reach the src folder.

### Issue 2: ImageKit mock not working
**Solution:** Mock ImageKit before importing the app. Mock setup must happen before module initialization.

### Issue 3: Multer file not attached
**Solution:** Use `.attach()` method in supertest to attach files. Ensure field names match router configuration.

### Issue 4: Timeout errors
**Solution:** Increase testTimeout in jest.config.js or use `.timeout()` in specific tests.

## CI/CD Integration

For GitHub Actions:
```yaml
- name: Run tests
  run: npm test -- --coverage
```

For other CI systems, use:
```bash
npm test -- --ci --coverage --maxWorkers=2
```

## Best Practices

1. **Test Isolation:** Clear mocks between tests using `beforeEach()`
2. **Descriptive Names:** Use clear test descriptions for easy identification
3. **Error Handling:** Test both success and failure scenarios
4. **Edge Cases:** Include tests for boundary conditions
5. **Mocking:** Mock external dependencies (ImageKit, Database)
6. **Async Handling:** Always use `async/await` with HTTP tests
7. **Assertions:** Use specific assertions rather than generic ones

## Next Steps

1. Run tests: `npm test`
2. Check coverage: `npm run test:coverage`
3. Integrate with CI/CD pipeline
4. Add additional test suites for other endpoints
5. Set up pre-commit hooks to run tests

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [ImageKit Documentation](https://docs.imagekit.io/)
- [Multer Documentation](https://github.com/expressjs/multer)
