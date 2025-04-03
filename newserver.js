import express from "express";
import Razorpay from "razorpay";
import cors from "cors";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import { initializeApp, cert } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";
import jwt from "jsonwebtoken";
import { popGraphicsState } from "pdf-lib";
import nodemailer from "nodemailer";

// Load environment variables
dotenv.config();
const serviceAccount = JSON.parse(process.env.FIREBASE_CREDENTIALS);
const app = express();
app.use(cors());
app.use(cors({
  origin: 'http://localhost:5173', // Your frontend origin
  credentials: true
}));
app.use(bodyParser.json());

// Initialize Firebase with explicit project ID
initializeApp({
  credential: cert(serviceAccount),
  projectId: serviceAccount.project_id // Add this line
});
const db = getFirestore();
const auth = getAuth();

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASSWORD,
  },
});

// Function to send email
async function sendCompletionEmail(userEmail, jobDetails) {
  // Ensure files array exists
  const files = jobDetails.files || [];
  // Ensure settings object exists with defaults
  const settings = jobDetails.settings || {
    color: 'black',
    paperSize: 'A4',
    copies: 1,
    doubleSided: false,
    orientation: 'portrait',
    pageRange: 'all'
  };

  // Format files list for email with null checks
  const filesHtml = files.map(file => `
    <tr>
      <td style="padding: 8px 0; border-bottom: 1px solid #eee;">
        <span style="color: #202124; font-weight: 500;">${file.fileName || 'Untitled'}</span><br>
        <span style="color: #5f6368; font-size: 12px;">${file.pageCount || 0} pages • ₹${file.price || '0.00'}</span>
      </td>
    </tr>
  `).join('');

  // Format settings for email with null checks
  const settingsHtml = `
    <tr>
      <td style="padding: 8px 0; color: #5f6368;">Print Settings:</td>
      <td style="padding: 8px 0; color: #202124;">
        ${settings.color || 'black'} • ${settings.paperSize || 'A4'} • ${settings.copies || 1} ${(settings.copies || 1) > 1 ? 'copies' : 'copy'}<br>
        ${settings.doubleSided ? 'Double-sided' : 'Single-sided'} • ${settings.orientation || 'portrait'}<br>
        ${settings.pageRange && settings.pageRange !== 'all' ? `Pages: ${settings.pageRange}` : 'All pages'}
      </td>
    </tr>
  `;

  const htmlTemplate = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; font-family: Arial, sans-serif; background-color: #f6f9fc;">
      <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background-color: #ffffff; border-radius: 10px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="color: #1a73e8; margin-bottom: 10px;">Print Job Completed! 🎉</h1>
            <p style="color: #5f6368; margin: 0;">Your documents are ready for collection</p>
          </div>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
            <h2 style="color: #202124; margin-top: 0; font-size: 18px;">Job Details</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 8px 0; color: #5f6368;">Job ID:</td>
                <td style="padding: 8px 0; color: #202124;">${jobDetails.payment?.orderId || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #5f6368;">Hub:</td>
                <td style="padding: 8px 0; color: #202124;">${jobDetails.hubName || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 8px 0; color: #5f6368;">Amount:</td>
                <td style="padding: 8px 0; color: #202124;">₹${jobDetails.payment?.amount || '0.00'}</td>
              </tr>
              ${settingsHtml}
            </table>
          </div>
          
          <div style="background-color: #f8f9fa; border-radius: 8px; padding: 20px; margin-bottom: 30px;">
            <h2 style="color: #202124; margin-top: 0; font-size: 18px;">Files</h2>
            <table style="width: 100%; border-collapse: collapse;">
              ${filesHtml}
            </table>
          </div>
          
          <div style="text-align: center; margin-top: 30px;">
            <p style="color: #5f6368; margin-bottom: 20px;">Thank you for using our printing services!</p>
            <a href="http://localhost:5173/dashboard" 
               style="background-color: #1a73e8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; display: inline-block;">
              View Dashboard
            </a>
          </div>
          
          <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #e8eaed; text-align: center;">
            <p style="color: #5f6368; font-size: 12px;">
              This is an automated message, please do not reply to this email.<br>
              © 2024 PrintSuit. All rights reserved.
            </p>
          </div>
        </div>
      </div>
    </body>
    </html>
  `;

  const mailOptions = {
    from: process.env.EMAIL_USER,
    to: userEmail,
    subject: "Your Print Job is Complete! 🖨️",
    html: htmlTemplate,
    text: `Your print job has been completed.
Job Details:
- Order ID: ${jobDetails.payment?.orderId || 'N/A'}
- Hub: ${jobDetails.hubName || 'N/A'}
- Amount: ₹${jobDetails.payment?.amount || '0.00'}

Files:
${files.map(file => `- ${file.fileName || 'Untitled'} (${file.pageCount || 0} pages)`).join('\n')}

Print Settings:
- Color: ${settings.color || 'black'}
- Paper Size: ${settings.paperSize || 'A4'}
- Copies: ${settings.copies || 1}
- Double-sided: ${settings.doubleSided ? 'Yes' : 'No'}
- Orientation: ${settings.orientation || 'portrait'}
- Pages: ${settings.pageRange || 'all'}

Thank you for using our printing services!`
  };

  return transporter.sendMail(mailOptions);
}

// JWT Middleware
const verifyToken = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.split(" ")[1];

    if (!token) {
      return res.status(401).json({ error: "No token provided" });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await auth.getUser(decoded.uid);
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid token" });
  }
};

// Auth Routes
app.post("/signup", async (req, res) => {
  try {
    const { email, password, name } = req.body;

    // Create user in Firebase Auth
    const userRecord = await auth.createUser({
      email,
      password,
      displayName: name,
    });

    // Create user document in Firestore
    await db.collection("Users").doc(userRecord.uid).set({
      name,
      email,
      role: "user",
      photo: "",
      createdAt: new Date().toISOString(),
    });

    // Generate JWT
    const token = jwt.sign(
      {
        uid: userRecord.uid,
        name,
        email,
        role: "user",
        // photo:false
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.status(201).json({
      message: "User created successfully",
      token,
      user: {
        uid: userRecord.uid,
        email,
        name,
        role: "user",
        token:token,
        // photo:false
      },
    });
  } catch (error) {
    console.error("Signup error:", error);
    res.status(400).json({ error: error.message });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { email } = req.body;

    // Find user by email
    const userRecord = await auth.getUserByEmail(email);
    const userDoc = await db.collection("Users").doc(userRecord.uid).get();
    const userData = userDoc.data();

    // Generate JWT with user's name from Firestore
    const token = jwt.sign(
      {
        uid: userRecord.uid,
        name: userData.name, // Include name from Firestore
        email: userRecord.email,
        role: userData.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        name: userData.name, // Include name in response
        role: userData.role,
        token: token,
      },
    });
  } catch (error) {
    console.error("Login error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Token Verification Endpoint
app.get("verify", verifyToken, async (req, res) => {
  try {
    // Get fresh user data from Firestore
    const userDoc = await db.collection("Users").doc(req.user.uid).get();
    const userData = userDoc.data();

    res.json({
      valid: true,
      user: {
        uid: req.user.uid,
        email: req.user.email,
        name: userData.name,
        role: userData.role,
        photo: userData.photo,
      },
    });
  } catch (error) {
    console.error("Token verification error:", error);
    res.status(401).json({
      valid: false,
      error: "Token verification failed",
    });
  }
});

// Google Auth
app.post("/auth/google", async (req, res) => {
  try {
    const { uid, email, name, photo, isGoogleLogin } = req.body;

    // Check if user email already exists
    const existingUsers = await db.collection("Users")
      .where("email", "==", email)
      .get();

    if (!existingUsers.empty && isGoogleLogin) {
      // User exists, only update photo
      const existingUser = existingUsers.docs[0];
      await db.collection("Users").doc(existingUser.id).update({
        photo: photo || "",
        updatedAt: new Date().toISOString()
      });

      // Generate JWT with existing user data
      const token = jwt.sign(
        {
          uid: existingUser.id,
          email,
          role: existingUser.data().role,
          name: existingUser.data().name,
          photo: photo
        },
        process.env.JWT_SECRET,
        { expiresIn: "24h" }
      );

      return res.json({
        token,
        user: {
          uid: existingUser.id,
          email,
          name: existingUser.data().name,
          role: existingUser.data().role,
          photo
        }
      });
    }

    // If user doesn't exist or it's not a Google login, create/update user document
    await db.collection("Users").doc(uid).set({
      name,
      email,
      photo: photo || "",
      role: "user",
      updatedAt: new Date().toISOString(),
    }, { merge: true });

    const token = jwt.sign(
      {
        uid,
        name,
        email,
        role: "user",
        photo
      },
      process.env.JWT_SECRET,
      { expiresIn: "24h" }
    );

    res.json({
      token,
      user: {
        uid,
        email,
        name,
        role: "user",
        photo
      }
    });
  } catch (error) {
    console.error("Google auth error:", error);
    res.status(400).json({ error: error.message });
  }
});

// Protected Routes - example of using verifyToken middleware
app.post("/create-order", verifyToken, async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100,
      currency: "INR",
      receipt: `order_rcptid_${Date.now()}`,
      notes: {
        userId: req.user.uid,
      },
    };

    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Failed to create order" });
  }
});

app.post("/verify-payment", verifyToken, async (req, res) => {
  const { razorpay_payment_id, razorpay_order_id, razorpay_signature } =
    req.body;

  try {
    await db.collection("transactions").add({
      payment_id: razorpay_payment_id,
      order_id: razorpay_order_id,
      signature: razorpay_signature,
      userId: req.user.uid,
      timestamp: new Date(),
    });

    res.json({ success: true, message: "Payment verified and saved" });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Payment verification failed" });
  }
});

// Route to check and send emails for completed print jobs
app.get("/check-completed-jobs", async (req, res) => {
  try {
    const completedJobs = await db
      .collection("printJobs")
      .where("status", "==", "completed")
      .get();

    const emailPromises = completedJobs.docs
      .filter(doc => !doc.data().emailSent)
      .map(async (doc) => {
        // ...same logic as above...
        const jobData = doc.data();
        const userId = jobData.userId;

        const userDoc = await db.collection("Users").doc(userId).get();
        const userData = userDoc.data();

        if (userData && userData.email) {
          try {
            await sendCompletionEmail(userData.email, jobData);
            await db.collection("printJobs").doc(doc.id).update({ emailSent: true });
            return { success: true, jobId: doc.id };
          } catch (error) {
            console.error(`Failed to send email for job ${doc.id}:`, error);
            return { success: false, jobId: doc.id, error: error.message };
          }
        }
      });

    const results = await Promise.all(emailPromises);
    res.json({ message: "Processed completed jobs", results });
  } catch (error) {
    console.error("Error processing completed jobs:", error);
    res.status(500).json({ error: error.message });
  }
});

// Function to periodically check completed jobs
async function checkCompletedJobs() {
  try {
    // Verify database connection
    const healthCheck = await db.collection('Users').limit(1).get()
      .catch(error => {
        console.error('Database connection check failed:', error);
        return null;
      });

    if (!healthCheck) {
      console.error('Database connection is not healthy, skipping job check');
      return;
    }

    const completedJobs = await db
      .collection("printJobs")
      .where("status", "==", "completed")
      .where("emailSent", "==", false) // More efficient query
      .get();

    if (completedJobs.empty) {
      return; // No jobs to process
    }

    const emailPromises = completedJobs.docs.map(async (doc) => {
      const jobData = doc.data();
      const userId = jobData.userId;

      try {
        const userDoc = await db.collection("Users").doc(userId).get();
        if (!userDoc.exists) {
          console.error(`User ${userId} not found for job ${doc.id}`);
          return { success: false, jobId: doc.id, error: 'User not found' };
        }

        const userData = userDoc.data();
        if (!userData.email) {
          console.error(`No email found for user ${userId}`);
          return { success: false, jobId: doc.id, error: 'No user email' };
        }

        await sendCompletionEmail(userData.email, jobData);
        await doc.ref.update({ emailSent: true });
        console.log(`Email sent for job ${doc.id} to ${userData.email}`);
        return { success: true, jobId: doc.id };
      } catch (error) {
        console.error(`Failed to process job ${doc.id}:`, error);
        return { success: false, jobId: doc.id, error: error.message };
      }
    });

    await Promise.allSettled(emailPromises);
  } catch (error) {
    console.error("Error in checkCompletedJobs:", error);
    // Don't throw the error, just log it to prevent the interval from breaking
  }
}

// Adjust interval to check less frequently (every 5 minutes)
setInterval(checkCompletedJobs, 5 * 60 * 1000);

// Start checking immediately when server starts
checkCompletedJobs();

// Start Server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
