import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import serviceAccount from "./firebase_key.json" assert { type: "json" };
import nodemailer from "nodemailer";

// Load environment variables
dotenv.config();

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Initialize Firebase
initializeApp({
  credential: cert(serviceAccount),
});
const db = getFirestore();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD
  }
});

// Function to get user email
async function getUserEmail(userId) {
  try {
    const userDoc = await db.collection('users').doc(userId).get();
    if (userDoc.exists) {
      return userDoc.data().email;
    }
    return null;
  } catch (error) {
    console.error('Error fetching user email:', error);
    return null;
  }
}

// Monitor print jobs
db.collection('printJobs')
  .where('status', '==', 'complete')
  .onSnapshot(async (snapshot) => {
    snapshot.docChanges().forEach(async (change) => {
      if (change.type === 'modified' || change.type === 'added') {
        const printJob = change.doc.data();
        const userEmail = await getUserEmail(printJob.userId);
        
        if (userEmail) {
          const mailOptions = {
            from: process.env.EMAIL_USER,
            to: userEmail,
            subject: 'Print Job Completed',
            text: `Your print job ${printJob.jobId || change.doc.id} has been completed and is ready for pickup.`
          };

          transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
              console.error('Error sending email:', error);
            } else {
              console.log('Email sent:', info.response);
            }
          });
        }
      }
    });
  });

// Route to Create Order
app.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100, // Convert to paise
      currency: "INR",
      receipt: `order_rcptid_${Date.now()}`,
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

// Route to Verify Payment
app.post("/verify-payment", async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } = req.body;

  try {
    // Save transaction to Firebase
    await db.collection("transactions").add({
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      signature: razorpay_signature,
      timestamp: new Date(),
    });

    res.json({ success: true, message: "Payment verified and saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
