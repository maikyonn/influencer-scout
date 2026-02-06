#!/usr/bin/env node
/**
 * Helper script to get pipeline job document from Firestore
 * Usage: node get-job.cjs <job_id>
 */

const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

const jobId = process.argv[2];

if (!jobId) {
  console.error('Usage: node get-job.cjs <job_id>');
  process.exit(1);
}

// Initialize Firebase Admin
try {
  admin.initializeApp({
    projectId: process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT_ID || 'penni-ai-platform',
  });
} catch (error) {
  // If already initialized, continue
  if (!error.message.includes('already been initialized')) {
    console.error(JSON.stringify({ error: error.message }));
    process.exit(1);
  }
}

const db = getFirestore();

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
