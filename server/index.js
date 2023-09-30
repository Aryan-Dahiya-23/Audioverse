import express from 'express';
import bodyParser from "body-parser";
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import multer from "multer";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";
import mongoose from 'mongoose';
import User from './models/User.js';
import Product from './models/Product.js';
import products from './data.js';
import { register, login, verify, logout } from "./controllers/authController.js";
import Stripe from 'stripe';

const stripe = new Stripe('sk_test_51NOJ90SIKHsVKPDzAElzMcJKIdzUqW8JUInVRhj5tZTaLvICvGu4OTWviuLLGni4nl7XZENh3CNeV2FBmiM9Udu000lut5OExG');

// Load environment variables from a .env file
dotenv.config();

// Create Express application
const app = express();

// Middleware
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(helmet());

app.use('/webhook', express.raw({ type: 'application/json' }));

app.use(express.json());
app.use(helmet.crossOriginResourcePolicy({ policy: "cross-origin" }));
app.use(bodyParser.json({ limit: "30mb", extended: true }));
app.use(bodyParser.urlencoded({ limit: "30mb", extended: true }));

app.use(cors({
    credentials: true,
    origin: "https://ecommerce-deploy-lft5.vercel.app"
}));

app.use(cookieParser());

const MONGODB_URI = "mongodb+srv://ecommerceDB:2JD445YpeVJX8xxh@cluster0.c1qeutt.mongodb.net/?retryWrites=true&w=majority"
mongoose.connect(MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
})
    .then(() => {
        console.log('Connected to MongoDB');
    })
    .catch((error) => {
        console.error('Error connecting to MongoDB:', error);
    });


// try {
//     await Product.insertMany(products);
//     console.log('Product data inserted');
// } catch (error) {
//     console.log('Error inserting product data:', error);
// }

// Routes
app.post("/register", register);
app.post("/login", login);
app.post("/logout", logout);
app.get("/profile", verify);


app.get('/products', async (req, res) => {
    try {
        // Fetch all products from the database
        const products = await Product.find().exec();
        products.sort((a, b) => a.index - b.index);
        res.json(products);
    } catch (error) {
        console.log('Error fetching products:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

app.get("/product/:id", async (req, res) => {
    try {
        const productId = req.params.id;
        const product = await Product.findById(productId);
        res.json(product);
    } catch (error) {
        console.error("Error fetching product:", error);
        res.status(500).json({ error: "An error occurred while fetching the product" });
    }
});

app.get('/user', async (req, res) => {
    try {
        const { email } = req.query;
        const user = await User.findOne({ email });

        if (user) {
            res.status(200).json({ ok: true, user });
        } else {
            res.status(404).json({ message: 'User not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Server error' });
    }
});


app.post("/updateuser", async (req, res) => {
    try {
        const { email, updatedUser } = req.body;

        // Find the user by email and update the user object
        const updatedUserDocument = await User.findOneAndUpdate(
            { email: email },
            updatedUser,
            { new: true }
        );

        if (updatedUserDocument) {
            res.status(200).json({ ok: true, user: updatedUserDocument });
        } else {
            res.status(404).json({ ok: false, message: 'User not found' });
        }
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Server error' });
    }
});

app.post('/api/checkout', async (req, res) => {
    try {
        const { amount } = req.body;

        // Create a Stripe Checkout Session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card'],
            line_items: [
                {
                    price_data: {
                        currency: 'usd',
                        product_data: {
                            name: 'Product Name',
                        },
                        unit_amount: amount * 100,
                    },
                    quantity: 1,
                },
            ],
            mode: 'payment',
            success_url: "https://ecommerce-deploy-lft5.vercel.app",
            cancel_url: "https://ecommerce-deploy-lft5.vercel.app",
        });

        res.status(200).json({ sessionId: session.id });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

app.post('/create-checkout-session', async (req, res) => {

    const { user, subtotal } = req.body;

    const product = await stripe.products.create({
        name: 'Your Product Name',
        description: 'Your Product Description',
    });

    const price = await stripe.prices.create({
        product: product.id,
        unit_amount: subtotal * 100,
        currency: 'inr',
    });

    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                price: price.id,
                quantity: 1,
            },
        ],
        mode: 'payment',
        success_url: "https://ecommerce-deploy-lft5.vercel.app/success",
        cancel_url: "https://ecommerce-deploy-lft5.vercel.app",
    });

    res.json({ session });
});

app.post('/webhook', express.raw({ type: 'application/json' }), (request, response) => {
    const sig = request.headers['stripe-signature'];
    const webhookSecret = "whsec_FUROGEao7v6oe45VMzYrpDFEjmirwSvQ";

    console.log("Webhook is triggered");

    let event;

    try {
        console.log("Inside try block");
        event = stripe.webhooks.constructEvent(request.body, sig, webhookSecret);
    } catch (err) {
        console.error("Error while verifying webhook:", err);
        response.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    switch (event.type) {
        case 'payment_intent.succeeded':
            console.log("Payment Successful");
            const paymentIntentSucceeded = event.data.object;
            break;
        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    response.json({ received: true });
});


app.get("/", (req, res) => {
    res.send("Hello");
})

// Start the server
const port = process.env.PORT;

app.listen(port, () => {
    console.log(`Server is running on port ${port}`);
});

