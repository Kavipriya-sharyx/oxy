// Fixed guardrail replies, keyed by trigger and language. No prices, no links, no sales text.
// Every text below is a DRAFT: [CONFIRM] = Oxxy must approve it before go-live.
// (The marker is a comment here on purpose: it must never be sent to a customer.)

export type ReplyKey =
  | "emergency"
  | "self_harm"
  | "opt_out"
  | "opt_out_booking"
  | "escalation"
  | "health_notice"
  | "health_consent_yes"
  | "health_consent_no"
  | "health_consent_unclear";
export type ReplyLanguage = "en" | "hi" | "hinglish";

// Version of the DPDP health-data notice below. Change it whenever the notice text changes: every
// customer must then give consent again (consent saved under an older version is never valid).
export const NOTICE_VERSION = "dpdp-health-v1";

export const FIXED_REPLIES: Record<ReplyKey, Record<ReplyLanguage, string>> = {
  emergency: {
    // [CONFIRM]
    en:
      "This sounds like it could be an emergency. Please call 112 or 108 right now, or go to the nearest hospital. " +
      "We have paused our plan conversation, and a team member will follow up with you.",
    // [CONFIRM]
    hi:
      "यह एक आपात स्थिति हो सकती है। कृपया अभी 112 या 108 पर कॉल करें, या नज़दीकी अस्पताल जाएँ। " +
      "हमने अपनी प्लान की बातचीत रोक दी है, और हमारी टीम का एक सदस्य आपसे संपर्क करेगा।",
    // [CONFIRM]
    hinglish:
      "Yeh emergency ho sakti hai. Kripya abhi 112 ya 108 par call karein, ya najdeeki hospital jaayein. " +
      "Humne apni plan ki baatcheet rok di hai, aur hamari team ka ek member aapse sampark karega.",
  },
  self_harm: {
    // [CONFIRM]
    en:
      "I'm really sorry you are going through this. You do not have to face it alone. " +
      "Please call Tele-MANAS on 14416 to talk to someone now. If you are in immediate danger, call 112. " +
      "A team member will also reach out to you.",
    // [CONFIRM]
    hi:
      "मुझे बहुत दुख है कि आप इस दौर से गुज़र रहे हैं। आपको अकेले इसका सामना नहीं करना है। " +
      "कृपया अभी किसी से बात करने के लिए Tele-MANAS को 14416 पर कॉल करें। " +
      "अगर आप तुरंत खतरे में हैं, तो 112 पर कॉल करें। हमारी टीम का एक सदस्य भी आपसे संपर्क करेगा।",
    // [CONFIRM]
    hinglish:
      "Mujhe bahut dukh hai ki aap is daur se guzar rahe hain. Aapko akele iska saamna nahi karna hai. " +
      "Kripya abhi kisi se baat karne ke liye Tele-MANAS ko 14416 par call karein. " +
      "Agar aap turant khatre mein hain, to 112 par call karein. Hamari team ka ek member bhi aapse sampark karega.",
  },
  opt_out: {
    // [CONFIRM]
    en: "You have been unsubscribed. We will not send you any more messages. Thank you.",
    // [CONFIRM]
    hi: "आपको अनसब्सक्राइब कर दिया गया है। हम आपको अब कोई संदेश नहीं भेजेंगे। धन्यवाद।",
    // [CONFIRM]
    hinglish: "Aapko unsubscribe kar diya gaya hai. Hum aapko ab koi message nahi bhejenge. Dhanyavaad.",
  },
  opt_out_booking: {
    // [CONFIRM]
    en:
      "You have been unsubscribed from messages. Your booking request is still with our team, " +
      "and they may contact you about it. Thank you.",
    // [CONFIRM]
    hi:
      "आपको संदेशों से अनसब्सक्राइब कर दिया गया है। आपका बुकिंग अनुरोध अभी हमारी टीम के पास है, " +
      "और वे इस बारे में आपसे संपर्क कर सकते हैं। धन्यवाद।",
    // [CONFIRM]
    hinglish:
      "Aapko messages se unsubscribe kar diya gaya hai. Aapka booking request abhi hamari team ke paas hai, " +
      "aur woh is baare mein aapse sampark kar sakte hain. Dhanyavaad.",
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
  health_notice: {
    // [CONFIRM]
    en:
      "Before we continue: to suggest a suitable plan and find the right centre for you, Oxxy would like to ask for " +
      "health-related information: the kind of healthcare you need, who it is for, and your yearly medical spending. " +
      "We use it only to recommend options, find centres and arrange any booking you ask for. It is seen by our team " +
      "and, for a booking, shared with the centre you choose. Sharing this information is your choice. You can say " +
      "no and still get general help, and you can change your mind later by writing to us. " +
      "Do you agree to share this health information? Please reply YES or NO.",
    // [CONFIRM]
    hi:
      "आगे बढ़ने से पहले: आपके लिए सही प्लान सुझाने और सही केंद्र ढूँढने के लिए Oxxy आपसे स्वास्थ्य से जुड़ी जानकारी " +
      "माँगना चाहता है: आपको किस तरह की स्वास्थ्य सेवा चाहिए, वह किसके लिए है, और आपका सालाना चिकित्सा खर्च। " +
      "हम इसका उपयोग केवल विकल्प सुझाने, केंद्र ढूँढने और आपके कहने पर बुकिंग कराने के लिए करते हैं। इसे हमारी टीम देखती है " +
      "और बुकिंग के लिए आपके चुने हुए केंद्र के साथ साझा किया जाता है। यह जानकारी देना आपकी मर्ज़ी है। आप मना कर सकते हैं " +
      "और फिर भी सामान्य मदद पा सकते हैं, और बाद में हमें लिखकर अपना फ़ैसला बदल सकते हैं। " +
      "क्या आप यह स्वास्थ्य जानकारी साझा करने के लिए सहमत हैं? कृपया हाँ या नहीं लिखें।",
    // [CONFIRM]
    hinglish:
      "Aage badhne se pehle: aapke liye sahi plan sujhane aur sahi centre dhoondhne ke liye Oxxy aapse health se judi " +
      "jaankari maangna chahta hai: aapko kis tarah ki healthcare chahiye, woh kiske liye hai, aur aapka saalana medical kharcha. " +
      "Hum ise sirf options sujhane, centre dhoondhne aur aapke kehne par booking karane ke liye use karte hain. Ise hamari team " +
      "dekhti hai aur booking ke liye aapke chune hue centre ke saath share kiya jaata hai. Yeh jaankari dena aapki marzi hai. " +
      "Aap mana kar sakte hain aur phir bhi general madad pa sakte hain, aur baad mein humein likhkar apna faisla badal sakte hain. " +
      "Kya aap yeh health jaankari share karne ke liye sehmat hain? Kripya YES ya NO likhein.",
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
};

// The neutral savings line (plan 12.x: "use the neutral savings line"). The ONLY savings wording a reply may
// contain: no promise, no number. The system adds it after a plan suggestion; the reply validator lets it
// through word for word and rejects every other saving / discount wording.
// DRAFT: [CONFIRM] Oxxy must approve it.
export const NEUTRAL_SAVINGS_LINE: Record<ReplyLanguage, string> = {
  en: "Any illustrated saving depends on your own medical spend and is not guaranteed.",
  hi: "कोई भी दर्शाई गई बचत आपके अपने चिकित्सा खर्च पर निर्भर करती है और उसकी गारंटी नहीं है।",
  hinglish: "Dikhayi gayi koi bhi bachat aapke apne medical kharche par nirbhar karti hai aur uski guarantee nahi hai.",
};

// Unknown or missing language -> English
export function fixedReply(key: ReplyKey, language?: string | null): string {
  const lang: ReplyLanguage = language === "hi" || language === "hinglish" ? language : "en";
  return FIXED_REPLIES[key][lang];
}
