// Fixed guardrail replies, keyed by trigger and language. No prices, no links, no sales text.
// Every text below is a DRAFT: [CONFIRM] = Oxxy must approve it before go-live.
// (The marker is a comment here on purpose: it must never be sent to a customer.)

export type ReplyKey =
  | "emergency"
  | "self_harm"
  | "opt_out"
  | "opt_out_booking"
  | "opt_out_payment"
  | "opt_in"
  | "escalation"
  | "health_notice"
  | "health_consent_yes"
  | "health_consent_no"
  | "health_consent_unclear"
  | "privacy"
  | "complaint";
export type ReplyLanguage = "en" | "hi" | "hinglish";

// Version of the DPDP health-data notice below. Change it whenever the notice text changes: every
// customer must then give consent again (consent saved under an older version is never valid).
export const NOTICE_VERSION = "dpdp-health-v2"; // v2 = Playbook 16.3 wording (retention + privacy contact)

export const FIXED_REPLIES: Record<ReplyKey, Record<ReplyLanguage, string>> = {
  // Playbook 16.1 (approved English)
  emergency: {
    en:
      "This may need immediate medical attention. Please call 112 (or 108 for an ambulance) or go to the nearest " +
      "emergency department now. I will pause the plan and activation discussion.",
    // [CONFIRM]
    hi:
      "इसके लिए तुरंत चिकित्सा सहायता की ज़रूरत हो सकती है। कृपया अभी 112 पर कॉल करें (एम्बुलेंस के लिए 108) या नज़दीकी " +
      "इमरजेंसी विभाग में जाएँ। मैं प्लान और एक्टिवेशन की बातचीत रोक रहा हूँ।",
    // [CONFIRM]
    hinglish:
      "Isme turant medical madad ki zaroorat ho sakti hai. Kripya abhi 112 par call karein (ambulance ke liye 108) ya " +
      "sabse nazdeeki emergency department jaayein. Main plan aur activation ki baat rok raha hoon.",
  },
  // Playbook 16.1: the emergency reply + Tele-MANAS 14416 (free, 24x7)
  self_harm: {
    en:
      "I'm really sorry you are going through this. You do not have to face it alone. Please call Tele-MANAS on " +
      "14416 (free, 24x7) to talk to someone now. If you are in immediate danger, call 112. I will pause the plan " +
      "and activation discussion.",
    // [CONFIRM]
    hi:
      "मुझे सच में अफ़सोस है कि आप इससे गुज़र रहे हैं। आप अकेले नहीं हैं। कृपया अभी किसी से बात करने के लिए Tele-MANAS को " +
      "14416 पर कॉल करें (मुफ़्त, 24x7)। अगर आप तुरंत ख़तरे में हैं, तो 112 पर कॉल करें। मैं प्लान और एक्टिवेशन की बातचीत रोक रहा हूँ।",
    // [CONFIRM]
    hinglish:
      "Mujhe sach mein afsos hai ki aap is se guzar rahe hain. Aap akele nahi hain. Kripya abhi kisi se baat karne ke " +
      "liye Tele-MANAS ko 14416 par call karein (free, 24x7). Agar aap turant khatre mein hain, to 112 par call karein. " +
      "Main plan aur activation ki baat rok raha hoon.",
  },
  // Playbook 16.3 (approved English): confirm, no further question
  opt_out: {
    en: "Certainly. I have recorded that you do not want further WhatsApp communication. I will end the chat now.",
    // [CONFIRM]
    hi: "ज़रूर। मैंने दर्ज कर लिया है कि आप आगे WhatsApp पर संपर्क नहीं चाहते। मैं अब चैट समाप्त कर रहा हूँ।",
    // [CONFIRM]
    hinglish: "Zaroor. Maine record kar liya hai ki aap aage WhatsApp par communication nahi chahte. Main ab chat band kar raha hoon.",
  },
  // Playbook 16.3: opt-out with an open booking request
  opt_out_booking: {
    en:
      "Certainly. I have recorded that you do not want further WhatsApp communication. Your existing booking request " +
      "stays recorded, and the Oxxy team will contact you only about it. I will end the chat now.",
    // [CONFIRM]
    hi:
      "ज़रूर। मैंने दर्ज कर लिया है कि आप आगे WhatsApp पर संपर्क नहीं चाहते। आपकी मौजूदा बुकिंग रिक्वेस्ट दर्ज रहेगी, और Oxxy " +
      "टीम आपसे केवल उसी के बारे में संपर्क करेगी। मैं अब चैट समाप्त कर रहा हूँ।",
    // [CONFIRM]
    hinglish:
      "Zaroor. Maine record kar liya hai ki aap aage WhatsApp par communication nahi chahte. Aapki existing booking " +
      "request record rahegi, aur Oxxy team aapse sirf usi ke baare mein contact karegi. Main ab chat band kar raha hoon.",
  },
  // Playbook 3.1 / 16.3: an open payment case keeps only that service contact [CONFIRM wording]
  opt_out_payment: {
    en:
      "Certainly. I have recorded that you do not want further WhatsApp communication. Your open payment case stays " +
      "with the Oxxy team, and they will contact you only about it. I will end the chat now.",
    hi:
      "ज़रूर। मैंने दर्ज कर लिया है कि आप आगे WhatsApp पर संपर्क नहीं चाहते। आपका खुला पेमेंट केस Oxxy टीम के पास रहेगा, और " +
      "वे आपसे केवल उसी के बारे में संपर्क करेंगे। मैं अब चैट समाप्त कर रहा हूँ।",
    hinglish:
      "Zaroor. Maine record kar liya hai ki aap aage WhatsApp par communication nahi chahte. Aapka open payment case " +
      "Oxxy team ke paas rahega, aur woh aapse sirf usi ke baare mein contact karenge. Main ab chat band kar raha hoon.",
  },
  opt_in: {
    // [CONFIRM]
    en: "Welcome back! You will get messages from Oxxy again. Reply STOP at any time to unsubscribe. How can I help you today?",
    // [CONFIRM]
    hi: "आपका फिर से स्वागत है! अब आपको Oxxy से संदेश फिर मिलेंगे। अनसब्सक्राइब करने के लिए कभी भी STOP लिखें। आज मैं आपकी क्या मदद कर सकता हूँ?",
    // [CONFIRM]
    hinglish:
      "Welcome back! Ab aapko Oxxy se messages phir milenge. Unsubscribe karne ke liye kabhi bhi STOP likhein. Aaj main aapki kya madad kar sakta hoon?",
  },
  escalation: {
    // [CONFIRM]
    en: "Of course. I have asked a team member to contact you shortly.",
    // [CONFIRM]
    hi: "ज़रूर। मैंने हमारी टीम के एक सदस्य से आपसे जल्द संपर्क करने को कहा है।",
    // [CONFIRM]
    hinglish: "Zaroor. Maine hamari team ke ek member se kaha hai ki woh aapse jaldi sampark karein.",
  },

  // ---- DPDP health-data consent (sent before ANY health question; see NOTICE_VERSION) ----
  // The notice says what is collected, why, how it is used, that consent is optional and can be refused.
  // The statements about sharing and withdrawing must be checked by Oxxy / legal before go-live.
  // Playbook 16.3 (approved English). {retention} and {privacy_contact} come from the config
  // (RETENTION_DAYS, OXXY_PRIVACY_CONTACT) [CONFIRM both before launch]. "Sharing them is your choice" is
  // added to the Playbook text so the consent is clearly voluntary (DPDP Act 2023) [CONFIRM with legal].
  // A change here = a new NOTICE_VERSION.
  health_notice: {
    en:
      "Before you share health details: Oxxy uses them only to arrange your booking, savings and support, keeps " +
      "them for {retention}, and you can ask for deletion anytime at {privacy_contact}. Sharing them is your choice. Is that okay? Please reply YES or NO.",
    // [CONFIRM]
    hi:
      "स्वास्थ्य से जुड़ी जानकारी देने से पहले: Oxxy इसका उपयोग केवल आपकी बुकिंग, बचत और सहायता के लिए करता है, इसे " +
      "{retention} तक रखता है, और आप {privacy_contact} पर कभी भी इसे हटाने के लिए कह सकते हैं। यह जानकारी देना आपकी मर्ज़ी है। क्या यह ठीक है? कृपया YES या NO लिखें।",
    // [CONFIRM]
    hinglish:
      "Health details share karne se pehle: Oxxy inka use sirf aapki booking, savings aur support ke liye karta hai, " +
      "inhe {retention} tak rakhta hai, aur aap {privacy_contact} par kabhi bhi deletion ke liye keh sakte hain. " +
      "Yeh share karna aapki marzi hai. Kya yeh theek hai? Kripya YES ya NO likhiye.",
  },
  health_consent_yes: {
    // [CONFIRM]
    en: "Thank you, your consent is saved.", // the welcome + opening list follow (OpeningMenu.ts)
    // [CONFIRM]
    hi: "धन्यवाद, आपकी सहमति सेव कर ली गई है।",
    // [CONFIRM]
    hinglish: "Dhanyavaad, aapki sehmati save kar li gayi hai.",
  },
  health_consent_no: {
    // [CONFIRM]
    en:
      "No problem, we will not ask about your health. I can still help you find centres, share general information " +
      "about our plans, or connect you with a team member. What would you like?",
    // [CONFIRM]
    hi:
      "कोई बात नहीं, हम आपसे आपके स्वास्थ्य के बारे में नहीं पूछेंगे। मैं फिर भी केंद्र ढूँढने, हमारे प्लान की सामान्य जानकारी " +
      "देने, या हमारी टीम के किसी सदस्य से जोड़ने में मदद कर सकता हूँ। आप क्या चाहेंगे?",
    // [CONFIRM]
    hinglish:
      "Koi baat nahi, hum aapse aapki health ke baare mein nahi poochhenge. Main phir bhi centres dhoondhne, hamare plans ki " +
      "general jaankari dene, ya hamari team ke kisi member se jodne mein madad kar sakta hoon. Aap kya chahenge?",
  },
  health_consent_unclear: {
    // [CONFIRM]
    en:
      "Sorry, I did not understand. Do you agree to share your health-related information with us as described? " +
      "Please reply YES or NO.",
    // [CONFIRM]
    hi:
      "क्षमा करें, मैं समझ नहीं पाया। क्या आप बताई गई शर्तों पर अपनी स्वास्थ्य संबंधी जानकारी हमारे साथ साझा करने के लिए सहमत हैं? " +
      "कृपया हाँ या नहीं लिखें।",
    // [CONFIRM]
    hinglish:
      "Maaf kijiye, main samajh nahi paya. Kya aap bataye gaye tarike se apni health se judi jaankari humare saath share karne " +
      "ke liye sehmat hain? Kripya YES ya NO likhein.",
  },
  // Playbook 16.3 (approved English); {privacy_contact} = OXXY_PRIVACY_CONTACT [CONFIRM]
  privacy: {
    en:
      "I understand. I will record your privacy request for handling under the applicable process and stop the " +
      "activation discussion. You can also contact {privacy_contact}.",
    // [CONFIRM]
    hi:
      "मैं समझता हूँ। मैं आपकी प्राइवेसी रिक्वेस्ट लागू प्रक्रिया के तहत दर्ज कर रहा हूँ और एक्टिवेशन की बातचीत रोक रहा हूँ। " +
      "आप {privacy_contact} पर भी संपर्क कर सकते हैं।",
    // [CONFIRM]
    hinglish:
      "Main samajhta hoon. Main aapki privacy request applicable process ke tahat record kar raha hoon aur activation " +
      "ki baat rok raha hoon. Aap {privacy_contact} par bhi contact kar sakte hain.",
  },
  complaint: {
    // [CONFIRM]
    en:
      "I am sorry for the trouble. I have raised an urgent request for a senior team member to review this and call you back shortly.",
    // [CONFIRM]
    hi:
      "असुविधा के लिए क्षमा करें। मैंने इस मामले की समीक्षा करने और आपको जल्द कॉल करने के लिए वरिष्ठ टीम को अनुरोध भेज दिया है।",
    // [CONFIRM]
    hinglish:
      "Takleef ke liye maafi chahte hain. Maine senior team member ko turant review karke aapko call karne ke liye request bhej di hai.",
  },
};

// The neutral savings line (Playbook 10, Trigger layer 6). The ONLY savings wording a Claude draft may
// contain: no promise, no number, no tie-up. Used for "do I get a discount at this centre?", the centre
// list and after a booking; the reply validator lets it through word for word and rejects every other
// saving / discount wording. English is the Playbook text; Hindi / Hinglish are DRAFTS: [CONFIRM].
export const NEUTRAL_SAVINGS_LINE: Record<ReplyLanguage, string> = {
  en: "Any saving at a specific centre is confirmed separately by the Oxxy team and may depend on the centre, service and plan.",
  hi: "किसी खास केंद्र पर कोई भी बचत Oxxy टीम अलग से पुष्टि करती है, और यह केंद्र, सेवा और प्लान पर निर्भर कर सकती है।",
  hinglish:
    "Kisi specific centre par koi bhi bachat Oxxy team alag se confirm karti hai, aur yeh centre, service aur plan par depend kar sakti hai.",
};

// Playbook 10: the neutral line + "I can still take your booking request there."
const BOOKING_STILL_POSSIBLE: Record<ReplyLanguage, string> = {
  en: "I can still take your booking request there.",
  hi: "मैं फिर भी वहाँ के लिए आपका बुकिंग अनुरोध ले सकता हूँ।",
  hinglish: "Main phir bhi wahan ke liye aapka booking request le sakta hoon.",
};

export function centreSavingReply(language?: string | null): string {
  const lang: ReplyLanguage = language === "hi" || language === "hinglish" ? language : "en";
  return `${NEUTRAL_SAVINGS_LINE[lang]} ${BOOKING_STILL_POSSIBLE[lang]}`;
}

// Playbook 16.3 placeholders [CONFIRM both before launch, Playbook 22.2]. Until then the official support
// e-mail (Playbook 21) and the privacy policy stand in.
export function privacyContact(): string {
  return process.env.OXXY_PRIVACY_CONTACT || process.env.OXXY_SUPPORT_EMAIL || "info@oxxy.in";
}
const RETENTION_TEXT: Record<ReplyLanguage, (days: number | null) => string> = {
  en: (d) => (d ? `${d} days` : "the period stated in the Oxxy privacy policy"),
  hi: (d) => (d ? `${d} दिन` : "Oxxy की प्राइवेसी पॉलिसी में बताई गई अवधि"),
  hinglish: (d) => (d ? `${d} din` : "Oxxy privacy policy mein batayi gayi avadhi"),
};
export function retentionText(lang: ReplyLanguage): string {
  const d = Number(process.env.RETENTION_DAYS);
  return RETENTION_TEXT[lang](Number.isFinite(d) && d > 0 ? Math.round(d) : null);
}

// Unknown or missing language -> English
export function fixedReply(key: ReplyKey, language?: string | null): string {
  const lang: ReplyLanguage = language === "hi" || language === "hinglish" ? language : "en";
  return FIXED_REPLIES[key][lang]
    .split("{privacy_contact}")
    .join(privacyContact())
    .split("{retention}")
    .join(retentionText(lang));
}
