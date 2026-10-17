export type ChannelMessage = {
  title: string;
  body: string;
  billId: string | null;
};

export interface NotificationChannel {
  id: string;
  label: string;
  enabled: boolean;
  deliver(message: ChannelMessage): Promise<{ ok: boolean; reason?: string }>;
}

/** Desktop notifications are sent by the Electron main process. This marks the channel as open. */
export const desktopChannel: NotificationChannel = {
  id: "desktop",
  label: "Desktop",
  enabled: true,
  async deliver() {
    return { ok: true };
  },
};

/** SMS stays off. A later plugin can replace this channel. */
export const smsChannel: NotificationChannel = {
  id: "sms",
  label: "SMS",
  enabled: false,
  async deliver() {
    return { ok: false, reason: "SMS is off." };
  },
};

export const channels: NotificationChannel[] = [desktopChannel, smsChannel];
