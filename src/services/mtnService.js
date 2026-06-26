const axios = require("axios");
const { v4: uuidv4 } = require("uuid");
const pool = require("../config/db");
const env = require("../config/env");
const AppError = require("../utils/AppError");

const BASE_URL = env.MTN_MOMO_ENVIRONMENT === "production"
  ? "https://proxy.momoapi.mtn.com"
  : "https://sandbox.momodeveloper.mtn.com";

class MTNService {
  constructor() {
    this.accessToken = null;
    this.tokenExpiresAt = null;
    this.env = env.MTN_MOMO_ENVIRONMENT || "sandbox";
  }

  generateUUID() {
    return uuidv4();
  }

  validatePhone(phone) {
    const cleaned = phone.replace(/[\s\-\(\)]/g, "");
    const ugandaRegex = /^(?:\+256|0)(7[0-9]{8}|20[0-9]{7})$/;
    if (!ugandaRegex.test(cleaned)) {
      throw new AppError("Invalid Ugandan phone number format. Use 07XXXXXXXXX or +256XXXXXXXXX", 400);
    }
    if (cleaned.startsWith("0")) {
      return "256" + cleaned.slice(1);
    }
    return cleaned.replace("+", "");
  }

  async createApiUser() {
    const referenceId = this.generateUUID();
    const callbackHost = env.MTN_MOMO_PROVIDER_CALLBACK_HOST || "http://localhost:5000";
    try {
      const response = await axios.post(
        `${BASE_URL}/v1_0/apiuser`,
        { providerCallbackHost: callbackHost },
        {
          headers: {
            "X-Reference-Id": referenceId,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return { referenceId, ...response.data };
    } catch (error) {
      if (error.response?.status === 409) return { referenceId };
      throw new AppError(`MTN API User creation failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async createApiKey(referenceId) {
    try {
      const response = await axios.post(
        `${BASE_URL}/v1_0/apiuser/${referenceId}/apikey`,
        {},
        {
          headers: {
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new AppError(`MTN API Key creation failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async getAccessToken() {
    if (this.accessToken && this.tokenExpiresAt && Date.now() < this.tokenExpiresAt) {
      return this.accessToken;
    }
    const apiKey = env.MTN_MOMO_API_KEY;
    const apiUser = env.MTN_MOMO_API_USER;
    if (!apiKey || !apiUser) {
      throw new AppError("MTN MoMo API credentials not configured", 500);
    }
    const auth = Buffer.from(`${apiUser}:${apiKey}`).toString("base64");
    try {
      const response = await axios.post(
        `${BASE_URL}/collection/token/`,
        {},
        {
          headers: {
            Authorization: `Basic ${auth}`,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      this.accessToken = response.data.access_token;
      this.tokenExpiresAt = Date.now() + (response.data.expires_in - 60) * 1000;
      return this.accessToken;
    } catch (error) {
      throw new AppError(`MTN OAuth token failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async requestToPay({ amount, phoneNumber, payerMessage, payeeNote, externalId }) {
    const token = await this.getAccessToken();
    const referenceId = this.generateUUID();
    const msisdn = this.validatePhone(phoneNumber);
    try {
      const response = await axios.post(
        `${BASE_URL}/collection/v1_0/requesttopay`,
        {
          amount: String(amount),
          currency: "EUR",
          externalId: externalId || referenceId,
          payer: { partyIdType: "MSISDN", partyId: msisdn },
          payerMessage: payerMessage || "Course enrollment payment",
          payeeNote: payeeNote || "Payment for Live Class Code course",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": referenceId,
            "X-Target-Environment": env.MTN_MOMO_ENVIRONMENT,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return { referenceId, statusCode: response.status };
    } catch (error) {
      throw new AppError(`MTN Request to Pay failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async getTransactionStatus(referenceId) {
    const token = await this.getAccessToken();
    try {
      const response = await axios.get(
        `${BASE_URL}/collection/v1_0/requesttopay/${referenceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env.MTN_MOMO_ENVIRONMENT,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new AppError(`MTN status check failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async getAccountBalance() {
    const token = await this.getAccessToken();
    try {
      const response = await axios.get(
        `${BASE_URL}/collection/v1_0/account/balance`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env.MTN_MOMO_ENVIRONMENT,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new AppError(`MTN balance check failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async requestRefund({ referenceId, amount, externalId, payerMessage }) {
    const token = await this.getAccessToken();
    const refundReferenceId = this.generateUUID();
    try {
      const response = await axios.post(
        `${BASE_URL}/collection/v1_0/requesttopayrefund`,
        {
          amount: String(amount),
          currency: "EUR",
          externalId: externalId || refundReferenceId,
          referenceIdToRefund: referenceId,
          payerMessage: payerMessage || "Refund for course payment",
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Reference-Id": refundReferenceId,
            "X-Target-Environment": env.MTN_MOMO_ENVIRONMENT,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
            "Content-Type": "application/json",
          },
        }
      );
      return { refundReferenceId, statusCode: response.status };
    } catch (error) {
      throw new AppError(`MTN Refund failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  async getRefundStatus(referenceId) {
    const token = await this.getAccessToken();
    try {
      const response = await axios.get(
        `${BASE_URL}/collection/v1_0/requesttopayrefund/${referenceId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            "X-Target-Environment": env.MTN_MOMO_ENVIRONMENT,
            "Ocp-Apim-Subscription-Key": env.MTN_MOMO_COLLECTION_PRIMARY_KEY,
          },
        }
      );
      return response.data;
    } catch (error) {
      throw new AppError(`MTN refund status check failed: ${error.response?.data?.message || error.message}`, 500);
    }
  }

  verifyWebhookSignature(payload, signature, expectedSignature) {
    if (!signature || !expectedSignature) return false;
    const crypto = require("crypto");
    const computed = crypto
      .createHmac("sha256", env.MTN_MOMO_COLLECTION_PRIMARY_KEY)
      .update(JSON.stringify(payload))
      .digest("hex");
    return crypto.timingSafeEqual(Buffer.from(computed), Buffer.from(expectedSignature));
  }

  async pollPaymentStatus(referenceId, maxRetries = 10, intervalMs = 5000) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      await new Promise((r) => setTimeout(r, intervalMs));
      try {
        const status = await this.getTransactionStatus(referenceId);
        if (status.status === "SUCCESSFUL") return { status: "completed", mtnStatus: status };
        if (status.status === "FAILED") return { status: "failed", mtnStatus: status };
        if (attempt === maxRetries) return { status: "timeout", mtnStatus: status };
      } catch {
        if (attempt === maxRetries) return { status: "timeout", mtnStatus: null };
      }
    }
    return { status: "timeout", mtnStatus: null };
  }
}

module.exports = new MTNService();
