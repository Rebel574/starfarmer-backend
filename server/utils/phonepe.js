// utils/phonepe.js
import crypto from "crypto";
import { v4 as uuidv4 } from "uuid"; // Example for generating unique IDs

// Replace with actual logic from PhonePe documentation
export const calculateChecksum = (payloadBase64, saltKey, saltIndex) => {
  const stringToHash = payloadBase64 + "/pg/v1/pay" + saltKey; // Example endpoint path, adjust as needed
  const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
  return `${sha256}###${saltIndex}`;
};

// Replace with actual logic from PhonePe documentation
export const verifyChecksum = (
  payloadBase64,
  receivedChecksum,
  saltKey,
  saltIndex,
) => {
  // String format specific to CALLBACK verification (Check PhonePe Docs!)
  const stringToHash = payloadBase64 + saltKey; // Usually NO API path here
  const sha256 = crypto.createHash("sha256").update(stringToHash).digest("hex");
  const expectedChecksum = `<span class="math-inline">\{sha256\}\#\#\#</span>{saltIndex}`;
  console.log("Expected Callback Checksum:", expectedChecksum); // Log for debugging
  console.log("Received Callback Checksum:", receivedChecksum);
  return expectedChecksum === receivedChecksum;
};

export const generateMerchantTransactionId = () => {
  // Generate a unique ID, e.g., using UUID
  return `MT_${uuidv4().replace(/-/g, "")}`; // Example format
};
