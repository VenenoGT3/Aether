const MOCK_EMAILS_KEY = "aether-mock-sent-emails";

export interface SentEmailMock {
  id: string;
  to: string;
  subject: string;
  html: string;
  sentAt: string;
  type: string;
}

function saveMockEmail(to: string, subject: string, html: string, type: string) {
  if (typeof window !== "undefined") {
    const newEmail: SentEmailMock = {
      id: `email_${Math.random().toString(36).substr(2, 9)}`,
      to,
      subject,
      html,
      sentAt: new Date().toISOString(),
      type
    };

    const stored = localStorage.getItem(MOCK_EMAILS_KEY);
    const list = stored ? JSON.parse(stored) : [];
    list.unshift(newEmail);
    localStorage.setItem(MOCK_EMAILS_KEY, JSON.stringify(list));
    window.dispatchEvent(new Event("aether-emails-sync"));
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  type = "general"
}: {
  to: string;
  subject: string;
  html: string;
  type?: string;
}): Promise<{ success: boolean; id?: string; error?: any }> {
  const apiKey = process.env.RESEND_API_KEY;
  const isMock = !apiKey || apiKey.includes("re_") === false || apiKey === "placeholder-resend-key";

  if (isMock) {
    console.log(`[MOCK EMAIL] To: ${to} | Subject: ${subject}`);
    saveMockEmail(to, subject, html, type);
    return { success: true, id: `mock-email-id-${Math.random().toString(36).substring(7)}` };
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "Aether <notifications@aether.co>",
        to,
        subject,
        html
      })
    });

    const data = await response.json();
    if (response.ok) {
      return { success: true, id: data.id };
    } else {
      return { success: false, error: data };
    }
  } catch (err: any) {
    console.error("Error sending live Resend email:", err);
    return { success: false, error: err.message || err };
  }
}

// Transactional Helpers
export async function sendCampaignMatchEmail(toEmail: string, brandName: string, campaignTitle: string, payout: number) {
  const subject = `New Campaign Match: ${campaignTitle} by ${brandName}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1d1d1f; line-height: 1.5;">
      <h2 style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">New Campaign Match!</h2>
      <p style="font-size: 15px; color: #86868b; margin-top: 0; margin-bottom: 24px;">You have a high-matching opportunity on Aether.</p>
      
      <div style="background-color: #f5f5f7; border-radius: 20px; padding: 24px; margin-bottom: 30px; border: 1px solid #e5e5ea;">
        <span style="font-size: 10px; font-weight: 700; color: #007aff; text-transform: uppercase; letter-spacing: 1px;">Sponsor</span>
        <h3 style="font-size: 18px; font-weight: 600; margin-top: 4px; margin-bottom: 4px; color: #1d1d1f;">${brandName}</h3>
        <p style="font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #1d1d1f;">${campaignTitle}</p>
        <p style="font-size: 13px; color: #515154; margin: 0;">We identified that your niche profile and target audience overlap extensively with this launch. The brand is offering a secure Stripe escrow payout of <strong>$${payout.toLocaleString()} USD</strong>.</p>
      </div>

      <a href="https://aether.co/influencer/discover" style="display: inline-block; background-color: #007aff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 30px; border-radius: 24px;">Apply to Campaign</a>
      
      <hr style="border: 0; border-top: 1px solid #d2d2d7; margin: 40px 0 20px 0;" />
      <p style="font-size: 11px; color: #86868b; line-height: 1.4; margin: 0;">Aether Notifications Inc., Cupertino, CA.<br />If you wish to change your notification frequencies, visit your user dashboard settings.</p>
    </div>
  `;
  return sendEmail({ to: toEmail, subject, html, type: "campaign_invite" });
}

export async function sendApplicationAcceptedEmail(toEmail: string, brandName: string, campaignTitle: string, payout: number) {
  const subject = `Application Accepted & Funded: ${campaignTitle}`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1d1d1f; line-height: 1.5;">
      <h2 style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; color: #34c759;">Application Accepted!</h2>
      <p style="font-size: 15px; color: #86868b; margin-top: 0; margin-bottom: 24px;">Great news, your pitch was accepted by the brand.</p>
      
      <div style="background-color: #f5f5f7; border-radius: 20px; padding: 24px; margin-bottom: 30px; border: 1px solid #e5e5ea;">
        <span style="font-size: 10px; font-weight: 700; color: #34c759; text-transform: uppercase; letter-spacing: 1px;">Stripe Escrow Secured</span>
        <h3 style="font-size: 18px; font-weight: 600; margin-top: 4px; margin-bottom: 4px; color: #1d1d1f;">${brandName}</h3>
        <p style="font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #1d1d1f;">${campaignTitle}</p>
        <p style="font-size: 13px; color: #515154; margin: 0;">The brand has funded the escrow payout of <strong>$${payout.toLocaleString()} USD</strong>. The funds are locked in Stripe and will release automatically when your draft deliverables are approved.</p>
      </div>

      <a href="https://aether.co/influencer/campaigns" style="display: inline-block; background-color: #34c759; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 30px; border-radius: 24px;">Submit Deliverables</a>
      
      <hr style="border: 0; border-top: 1px solid #d2d2d7; margin: 40px 0 20px 0;" />
      <p style="font-size: 11px; color: #86868b; line-height: 1.4; margin: 0;">Aether Notifications Inc., Cupertino, CA.</p>
    </div>
  `;
  return sendEmail({ to: toEmail, subject, html, type: "payment" });
}

export async function sendPaymentReleasedEmail(toEmail: string, brandName: string, campaignTitle: string, payout: number) {
  const subject = `Stripe Payout Released: $${payout.toLocaleString()} USD`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1d1d1f; line-height: 1.5;">
      <h2 style="font-size: 24px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px; color: #007aff;">Escrow Payout Complete</h2>
      <p style="font-size: 15px; color: #86868b; margin-top: 0; margin-bottom: 24px;">Your payout has been transferred to your connected Stripe account.</p>
      
      <div style="background-color: #f5f5f7; border-radius: 20px; padding: 24px; margin-bottom: 30px; border: 1px solid #e5e5ea;">
        <span style="font-size: 10px; font-weight: 700; color: #007aff; text-transform: uppercase; letter-spacing: 1px;">Transaction Successful</span>
        <h3 style="font-size: 18px; font-weight: 600; margin-top: 4px; margin-bottom: 4px; color: #1d1d1f;">${brandName}</h3>
        <p style="font-size: 16px; font-weight: 700; margin-top: 0; margin-bottom: 16px; color: #1d1d1f;">${campaignTitle}</p>
        <p style="font-size: 18px; font-weight: 850; color: #34c759; margin: 0;">+$${payout.toLocaleString()} USD</p>
        <p style="font-size: 13px; color: #515154; line-height: 1.5; margin-top: 8px; margin-bottom: 0;">The brand approved your submissions, releasing the funds from escrow. The deposit will appear in your bank account shortly.</p>
      </div>

      <a href="https://aether.co/influencer/dashboard" style="display: inline-block; background-color: #007aff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 30px; border-radius: 24px;">View Wallet Balance</a>
      
      <hr style="border: 0; border-top: 1px solid #d2d2d7; margin: 40px 0 20px 0;" />
      <p style="font-size: 11px; color: #86868b; line-height: 1.4; margin: 0;">Aether Notifications Inc., Cupertino, CA.</p>
    </div>
  `;
  return sendEmail({ to: toEmail, subject, html, type: "payment" });
}

export async function sendNewMessageEmail(toEmail: string, senderName: string, messageContent: string, campaignTitle: string) {
  const subject = `New Message from ${senderName} on "${campaignTitle}"`;
  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; color: #1d1d1f; line-height: 1.5;">
      <h2 style="font-size: 20px; font-weight: 700; letter-spacing: -0.4px; margin-bottom: 8px;">New Message Received</h2>
      <p style="font-size: 15px; color: #86868b; margin-top: 0; margin-bottom: 24px;">You have a new message on Aether for campaign "${campaignTitle}".</p>
      
      <div style="border-left: 3px solid #007aff; padding-left: 16px; margin: 24px 0;">
        <p style="font-size: 12px; font-weight: 700; color: #86868b; margin: 0 0 4px 0;">${senderName}</p>
        <p style="font-size: 14px; font-style: italic; color: #1d1d1f; margin: 0; line-height: 1.5;">"${messageContent}"</p>
      </div>

      <a href="https://aether.co/campaigns" style="display: inline-block; background-color: #007aff; color: #ffffff; text-decoration: none; font-size: 14px; font-weight: 600; padding: 12px 30px; border-radius: 24px;">Open Direct Chat</a>
      
      <hr style="border: 0; border-top: 1px solid #d2d2d7; margin: 40px 0 20px 0;" />
      <p style="font-size: 11px; color: #86868b; line-height: 1.4; margin: 0;">Aether Notifications Inc., Cupertino, CA.</p>
    </div>
  `;
  return sendEmail({ to: toEmail, subject, html, type: "message" });
}
