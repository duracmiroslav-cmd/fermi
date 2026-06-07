import { type Locale } from './locale.ts';

// Worker-side LINE notices. Kept inline (not in `i18n/locales/*.json`)
// because Deno + Vite disagree on JSON import attributes; the `__notice`
// bucket is reserved for these keys, so no overlap with dashboard.
const messages: Record<Locale, Record<string, string>> = {
  'zh-Hant': {
    __noticeAgentStepsExceeded:       '⚠️ 跑了 {steps} 步還沒收斂，先停下來。可以換個方式問我一次。',
    __noticeAudioEmpty:               '⚠️ 沒聽清楚，請再試一次。',
    __noticeAudioTooLarge:            '⚠️ 音訊太大，上限 10MB。',
    __noticeAudioTranscriptionFailed: '⚠️ 無法辨識這段語音，請再試一次。',
    __noticeDocumentEmpty:            '⚠️ 這個檔案抽不到文字。如果是掃描或拍照的 PDF，改傳照片我就能看。',
    __noticeDocumentTooLarge:         '⚠️ 檔案太大，上限 10MB。',
    __noticeDocumentTooLong:          '⚠️ 這份文件太長了，沒辦法在對話裡一次讀完。',
    __noticeDocumentUnreadable:       '⚠️ 這個檔案讀不到內容，可能損壞了，換一個再試試。',
    __noticeGroupActivated:           '✅ 開通成功，這個群組可以開始使用了。',
    __noticeGroupJoinPrompt:          '👋 你好，我是這個群組的助理。輸入啟用碼即可開通；開通後群組訊息會被處理以提供服務（例如語音轉文字、被 @ 時回應）。',
    __noticeGroupRateLimited:         '⏳ 訊息太頻繁了，請稍等一下再試。',
    __noticeImageTooLarge:            '⚠️ 圖片太大，上限 10MB。',
    __noticeImprintBound:             '✅ 已認證你為這個助理的主人。之後你可以直接在這裡請我調整設定，或查看哪裡出錯。',
    __noticeNewThreadStarted:         '👋 好，開了一段新對話。剛剛聊的內容我不會再記得，但你請我長期記住的事還留著。',
    __noticeNoAgent:                  '⚙️ 這個機器人還沒綁定 Agent，請通知機器人主人到後台綁定一個。',
    __noticeOpenaiKeyMissing:         '🎙️ 語音功能需要 OpenAI API key，這個機器人還沒設定。請通知機器人主人到後台連接，或在部署環境設定。',
    __noticeOpenrouterKeyMissing:     '⚙️ 這個機器人還沒設定 OpenRouter API key。請通知機器人主人到後台連接，或在部署環境設定。',
    __noticeServiceError:             '⚠️ 服務暫時忙線，請稍後再試。',
    __noticeUnsupportedAudioFormat:   '⚠️ 不支援的音訊格式。',
    __noticeUnsupportedDocumentType:  '⚠️ 目前只能讀 PDF、Word（.docx）、純文字（.txt／.md／.json）。',
    __noticeUnsupportedImageFormat:   '⚠️ 目前只支援 JPG / PNG / GIF / WebP。',
    __noticeUnsupportedMessageType:   '⚠️ 目前我還看不懂這種訊息，你可以用文字或語音跟我說。',
    __quickReplyNewThread:            '開新對話',
  },
  'en': {
    __noticeAgentStepsExceeded:       '⚠️ Took {steps} steps without converging. Stopping. Try rephrasing.',
    __noticeAudioEmpty:               '⚠️ Didn\'t catch that. Please try again.',
    __noticeAudioTooLarge:            '⚠️ Audio too large. Limit is 10MB.',
    __noticeAudioTranscriptionFailed: '⚠️ Could not transcribe this audio. Please try again.',
    __noticeDocumentEmpty:            '⚠️ No text found in this file. If it\'s a scanned or photographed PDF, send it as a photo instead.',
    __noticeDocumentTooLarge:         '⚠️ File too large. Limit is 10MB.',
    __noticeDocumentTooLong:          '⚠️ This document is too long to read here in the chat.',
    __noticeDocumentUnreadable:       '⚠️ Couldn\'t read this file — it may be corrupted. Try another one.',
    __noticeGroupActivated:           '✅ Activated — this group is ready to go.',
    __noticeGroupJoinPrompt:          '👋 Hi, I\'m this group\'s assistant. Enter the activation code to enable me. Once enabled, group messages are processed to provide the service (e.g. voice-to-text, replying when mentioned).',
    __noticeGroupRateLimited:         '⏳ Too many messages right now. Please wait a moment and try again.',
    __noticeImageTooLarge:            '⚠️ Image too large. Limit is 10MB.',
    __noticeImprintBound:             '✅ You\'re now verified as this assistant\'s owner. You can ask me to adjust its settings or look into errors right here.',
    __noticeNewThreadStarted:         '👋 Fresh start. I won\'t remember what we just talked about, but anything you asked me to remember long-term is still saved.',
    __noticeNoAgent:                  '⚙️ This bot has no agent attached. Ask the bot owner to bind one in the dashboard.',
    __noticeOpenaiKeyMissing:         '🎙️ Voice features need an OpenAI API key, which this bot hasn\'t set up. Ask the bot owner to connect one in the dashboard or set it in the deployment environment.',
    __noticeOpenrouterKeyMissing:     '⚙️ This bot has no OpenRouter API key configured. Ask the bot owner to connect one in the dashboard or set it in the deployment environment.',
    __noticeServiceError:             '⚠️ Service temporarily unavailable. Please try again later.',
    __noticeUnsupportedAudioFormat:   '⚠️ Unsupported audio format.',
    __noticeUnsupportedDocumentType:  '⚠️ I can only read PDF, Word (.docx), and plain text (.txt / .md / .json).',
    __noticeUnsupportedImageFormat:   '⚠️ Only JPG / PNG / GIF / WebP images are supported.',
    __noticeUnsupportedMessageType:   '⚠️ I can\'t read this kind of message yet. You can use text or voice.',
    __quickReplyNewThread:            'New conversation',
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
