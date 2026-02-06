#!/usr/bin/env node
/**
 * Helper script to get pipeline job document from Firestore
 * Usage: node get-job.js <job_id>
 */

// Use dynamic import for ES modules compatibility
let admin, firestore;

async function initFirebase() {
  if (!admin) {
    admin = await import('firebase-admin');
    const { initializeApp } = admin.default;
    const { getFirestore } = await import('firebase-admin/firestore');
    
    try {
      initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'penni-ai-platform',
      });
    } catch (error) {
      if (!error.message.includes('already been initialized')) {
        throw error;
      }
    }
    
    return getFirestore();
  }
  const { getFirestore } = await import('firebase-admin/firestore');
  return getFirestore();
}

// Fallback to CommonJS if ES modules don't work
function initFirebaseCommonJS() {
  try {
    const admin = require('firebase-admin');
    const { getFirestore } = require('firebase-admin/firestore');
    
    try {
      admin.initializeApp({
        projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'penni-ai-platform',
      });
    } catch (error) {
      if (!error.message.includes('already been initialized')) {
        throw error;
      }
    }
    
    return getFirestore();
  } catch (e) {
    return null;
  }
}

const jobId = process.argv[2];

if (!jobId) {
  console.error('Usage: node get-job.js <job_id>');
  process.exit(1);
}

// Initialize Firebase Admin
try {
  // Try to use application default credentials
  initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'penni-ai-platform',
  });
} catch (error) {
  // If already initialized, continue
  if (!error.message.includes('already been initialized')) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

// Try CommonJS first (more compatible)
const db = initFirebaseCommonJS();

if (db) {
  db.collection('pipeline_jobs')
    .doc(jobId)
    .get()
    .then((doc) => {
      if (doc.exists) {
        const data = doc.data();
        // Convert Firestore Timestamps to seconds for easier processing
        const converted = JSON.parse(
          JSON.stringify(data, (key, value) => {
            if (value && typeof value === 'object' && value.seconds !== undefined) {
              return { seconds: value.seconds, nanoseconds: value.nanoseconds };
            }
            return value;
          })
        );
        console.log(JSON.stringify(converted));
      } else {
        console.log('{}');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    });
} else {
  // Fallback to ES modules
  initFirebase()
    .then((db) => {
      return db.collection('pipeline_jobs').doc(jobId).get();
    })
    .then((doc) => {
      if (doc.exists) {
        const data = doc.data();
        const converted = JSON.parse(
          JSON.stringify(data, (key, value) => {
            if (value && typeof value === 'object' && value.seconds !== undefined) {
              return { seconds: value.seconds, nanoseconds: value.nanoseconds };
            }
            return value;
          })
        );
        console.log(JSON.stringify(converted));
      } else {
        console.log('{}');
      }
      process.exit(0);
    })
    .catch((error) => {
      console.error(JSON.stringify({ error: error.message }));
      process.exit(1);
    });
}

