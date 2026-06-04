import { type Locale } from './locale.ts';

// Worker-side LINE notices. Kept inline (not in `i18n/locales/*.json`)
// because Deno + Vite disagree on JSON import attributes; the `__notice`
// bucket is reserved for these keys, so no overlap with dashboard.
const messages: Record<Locale, Record<string, string>> = {
  'zh-Hant': {
    __noticeAgentStepsExceeded:        '⚠️ 跑了 {steps} 步還沒收斂，先停下來。可以換個方式問我一次。',
    __noticeAudioEmpty:                '⚠️ 沒聽清楚，請再試一次。',
    __noticeAudioTooLarge:             '⚠️ 音訊太大，上限 10MB。',
    __noticeAudioTranscriptionFailed:  '⚠️ 無法辨識這段語音，請再試一次。',
    __noticeFreeByokOpenai:            '🎙️ 語音功能需要 OpenAI key。免費方案請到 https://fermi.tw/dashboard/connectors 連接；升級 Pro 即可直接使用，無需自備 key。',
    __noticeFreeByokOpenrouter:        '⚙️ 還沒連接 OpenRouter。免費方案請到 https://fermi.tw/dashboard/connectors 連接；升級 Pro 即可直接使用，無需自備。',
    __noticeGroupActivated:            '✅ 開通成功，這個群組可以開始使用了。',
    __noticeGroupJoinPrompt:           '👋 你好，我是這個群組的助理。輸入啟用碼即可開通；開通後群組訊息會被處理以提供服務（例如語音轉文字、被 @ 時回應）。',
    __noticeGroupRateLimited:          '⏳ 訊息太頻繁了，請稍等一下再試。',
    __noticeImageTooLarge:             '⚠️ 圖片太大，上限 10MB。',
    __noticeNoAgent:                   '⚙️ 這個機器人還沒設定 Agent，請到 https://fermi.tw/dashboard 綁定一個。',
    __noticePlatformKeyOps:            '⚠️ Pro 服務暫時不可用，已通知 fermi 處理，請稍後再試。',
    __noticeQuotaExtendedRunExhausted: '⚠️ 這個月長對話額度已用完。可換更具體的問法，或請機器人主人升 Pro 換更高上限：https://fermi.tw/dashboard/billing',
    __noticeQuotaSttExhausted:         '⚠️ 這個月語音輸入額度已用完。可改傳文字訊息，或請機器人主人升 Pro 換更高上限：https://fermi.tw/dashboard/billing',
    __noticeQuotaTtsExhaustedSuffix:   '\n\n（本次語音回覆額度已用完，改用文字。升 Pro 換更高上限：https://fermi.tw/dashboard/billing）',
    __noticeServiceError:              '⚠️ 服務暫時忙線，請稍後再試。',
    __noticeUnsupportedAudioFormat:    '⚠️ 不支援的音訊格式。',
    __noticeUnsupportedImageFormat:    '⚠️ 目前只支援 JPG / PNG / GIF / WebP。',
    __noticeUnsupportedMessageType:    '⚠️ 目前只支援文字、圖片、語音訊息。',
  },
  'en': {
    __noticeAgentStepsExceeded:        '⚠️ Took {steps} steps without converging. Stopping. Try rephrasing.',
    __noticeAudioEmpty:                '⚠️ Didn\'t catch that. Please try again.',
    __noticeAudioTooLarge:             '⚠️ Audio too large. Limit is 10MB.',
    __noticeAudioTranscriptionFailed:  '⚠️ Could not transcribe this audio. Please try again.',
    __noticeFreeByokOpenai:            '🎙️ Voice features need an OpenAI key. On Free, the owner needs to connect one at https://fermi.tw/dashboard/connectors, or upgrade to Pro to use it right away, no key needed.',
    __noticeFreeByokOpenrouter:        '⚙️ OpenRouter is not connected. On Free, the owner needs to connect one at https://fermi.tw/dashboard/connectors, or upgrade to Pro to use it right away, no setup needed.',
    __noticeGroupActivated:            '✅ Activated — this group is ready to go.',
    __noticeGroupJoinPrompt:           '👋 Hi, I\'m this group\'s assistant. Enter the activation code to enable me. Once enabled, group messages are processed to provide the service (e.g. voice-to-text, replying when mentioned).',
    __noticeGroupRateLimited:          '⏳ Too many messages right now. Please wait a moment and try again.',
    __noticeImageTooLarge:             '⚠️ Image too large. Limit is 10MB.',
    __noticeNoAgent:                   '⚙️ This bot has no agent attached. The owner needs to bind one at https://fermi.tw/dashboard',
    __noticePlatformKeyOps:            '⚠️ Pro service temporarily unavailable. fermi has been notified. Please try again later.',
    __noticeQuotaExtendedRunExhausted: '⚠️ This month\'s extended-conversation quota is exhausted. Try a more specific question, or ask the owner to upgrade to Pro: https://fermi.tw/dashboard/billing',
    __noticeQuotaSttExhausted:         '⚠️ This month\'s voice-input quota is exhausted. Send text instead, or ask the owner to upgrade to Pro: https://fermi.tw/dashboard/billing',
    __noticeQuotaTtsExhaustedSuffix:   '\n\n(Voice reply quota exhausted this month. Falling back to text. Upgrade to Pro: https://fermi.tw/dashboard/billing)',
    __noticeServiceError:              '⚠️ Service temporarily unavailable. Please try again later.',
    __noticeUnsupportedAudioFormat:    '⚠️ Unsupported audio format.',
    __noticeUnsupportedImageFormat:    '⚠️ Only JPG / PNG / GIF / WebP images are supported.',
    __noticeUnsupportedMessageType:    '⚠️ Only text, image, and audio messages are supported.',
  },
};

const DEFAULT_LOCALE: Locale = 'zh-Hant';

export const t = (
  key: string,
  locale: Locale = DEFAULT_LOCALE,
  params?: Record<string, string | number>,
): string => {
  const primary = messages[locale];
  const fallback = messages[DEFAULT_LOCALE];
  let s = primary[key] ?? fallback[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return s;
};
