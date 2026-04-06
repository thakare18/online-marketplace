# MERN Marketplace – Microservices (Development Phase)

## Project Description

This project is a scalable e-commerce marketplace built using a microservices architecture with the MERN stack. It is designed to support multiple user roles including customers, sellers, and administrators. The platform enables product browsing, cart management, order processing, and secure payment handling.

The system focuses on scalability, modularity, and performance by leveraging distributed services and event-driven communication.

**Note:** This project is currently in the development phase, and features are actively being implemented and refined.

---

## Features

* User authentication using JWT and Google OAuth
* Product catalog with search, filtering, and pagination
* Cart management with dynamic price validation
* Order creation and lifecycle management
* Payment integration using Razorpay
* Event-driven notification system
* AI-based shopping assistant (in progress)
* Seller dashboard for analytics and inventory management
* Microservices-based scalable architecture

---

## Tech Stack

### Backend

* Node.js
* Express.js
* MongoDB Atlas
* RabbitMQ (event-driven communication)
* Redis (caching and rate limiting)

### Frontend

* React (Vite)
* Redux Toolkit Query

### DevOps and Deployment

* AWS ECR
* ECS Fargate
* Application Load Balancer (ALB)
* AWS CloudWatch

### Security

* JWT (access and refresh tokens)
* Helmet and CORS
* CSRF protection
* XSS sanitization
* Rate limiting using Redis
* Role-based access control (RBAC)

---

## Architecture Overview

* Microservices-based architecture
* Services communicate via REST APIs and RabbitMQ
* Each service manages its own data
* Load balancing and routing handled through AWS ALB

---

## Microservices

### Auth Service

Handles user registration, login, token management, and profile operations.

### Product Service

Manages product creation, updates, deletion, and catalog search functionality.

### Cart Service

Handles cart operations and validates product pricing and availability.

### Order Service

Manages order creation, updates, and lifecycle tracking.

### Payment Service

Integrates Razorpay for payment processing and verification.

### Notification Service

Processes events and sends notifications via email, SMS, or push.

### AI Buddy Service (In Progress)

Provides natural language-based product search and smart cart assistance.

### Seller Dashboard Service

Provides sales analytics, inventory tracking, and order insights.

---

## API Structure

All APIs follow REST standards and are versioned.

Example routes:

```
/auth/register
/products
/cart
/orders
/payments
```

---

## Database Entities

* User
* Product
* Cart
* Order
* Payment
* Notification
* Review (optional)

---

## Event-Driven Communication

RabbitMQ is used for inter-service communication through events such as:

* user.created
* product.updated
* order.created
* payment.success

---

## Security Measures

* Password hashing using bcrypt
* HTTP-only cookies for refresh tokens
* CSRF protection (double-submit method)
* Input validation using Zod or express-validator
* Rate limiting with Redis

---

## Installation and Setup

```bash
# Clone the repository
git clone https://github.com/your-username/mern-marketplace.git

# Navigate to the project directory
cd mern-marketplace

# Install dependencies
npm install

# Start development server
npm run dev
```

---

## Environment Variables

Create a `.env` file with the following:

```
PORT=
MONGO_URI=
JWT_SECRET=
RAZORPAY_KEY_ID=
RAZORPAY_SECRET=
REDIS_URL=
RABBITMQ_URL=
```

---

## Observability

* Logging using Morgan and Pino
* Request tracing with unique request IDs
* Monitoring via AWS CloudWatch

---

## Project Status

This project is currently in the development phase. Core services are being implemented, and additional features are under active development.

---

## Future Enhancements

* Real-time order tracking
* Recommendation system
* Advanced analytics dashboard
* Multi-language support

---
## Contact

For questions, feedback, or collaboration opportunities, feel free to reach out:

- Email: prathameshthakare9677@gmail.com


