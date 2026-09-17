/**
 * Notification service — interface only (Directive 031).
 * Today: mock (logs). Tomorrow: Gmail / Resend / Twilio behind this boundary.
 * SERVER-ONLY implementations.
 */
export interface NotificationService {
  send(input: { to: string; subject: string; body: string }): Promise<{ ok: boolean; id?: string }>;
}

export const mockNotificationService: NotificationService = {
  async send({ to, subject }) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[notification:mock] -> ${to}: ${subject}`);
    }
    return { ok: true };
  },
};
