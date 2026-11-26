# Oxxy Health — Voice AI Agent Tools & API Configuration Specification

This document provides the complete technical integration specification for the Voice AI Agent provider (e.g., SharyX, Vapi, Retell, LiveKit, or Custom Voice Engine). It defines every tool the Voice Agent must have, the exact API endpoint, HTTP method, authentication, request payload schema, response structure, and strict triggers for when each tool must be called.

---

## 1. Global Connection & Authentication Architecture

All tools interface with the Oxxy Actions API gateway:

- **Base URL:** `https://oxxy.sharyx.ai/api/v1/Actions`  
  *(Live Server: `https://oxxy.sharyx.ai/api/v1/Actions`)*
- **Authentication Header:** Every request **MUST** contain the API Key header:
  ```http
  X-Api-Key: <ACTIONS_API_KEY>
  Content-Type: application/json
  ```
- **Phone Number Normalization:** Numbers can be sent in E.164 (`+919840012345`), 10-digit (`9840012345`), or with country code (`919840012345`). The API normalizes them automatically.
- **Timeouts:** Recommended HTTP client timeout is **5000 ms** (5 seconds).

---

## 2. Tools Summary Table

| Tool Name | HTTP Method & Path | When to Call (Trigger Condition) | Sends Real-time WhatsApp? |
|---|---|---|---|
| `lookup_customer` | `GET /LookupCustomer` | At the start of the call (lead verification) | No |
| `get_official_plan` | `GET /OfficialPlan` | When customer asks about price/plan, or before recommending | No |
| `search_centres` | `GET /SearchCentres` | When customer asks for nearby hospitals, clinics, or labs | No |
| `send_voice_template` | `POST /SendTemplate` | **During call in real-time** when customer asks for WhatsApp link/proof | **Yes (Instant)** |
| `start_conversation` | `POST /StartConversation` | **At end of call** to hand off context to WhatsApp Chatbot | **Yes (Intro Card)** |
| `create_booking_request` | `POST /BookingRequests` | Customer agrees to book an appointment (hospital/date/time) | No (Sales confirms later) |
| `create_follow_up` | `POST /FollowUps` | Customer is busy or asks to call back at a specific time | Scheduled WhatsApp later |
| `set_opt_out` | `POST /OptOut` | Customer says "Do not call", "Stop", "Don't disturb" | No |
| `create_escalation` | `POST /Escalations` | Medical emergency, legal dispute, or angry complaint | No (Tasks created for human) |

---

## 3. Tool Specifications & Payload Details

---

### Tool 1: `lookup_customer`

#### Purpose
Fetches existing customer profile, name, consent status, active plans, open bookings, and past cases.

#### When to Call (Trigger)
- **Immediately upon call connect** (or pre-call lookup).
- Use this to personalize the opening line (e.g., greet by `first_name`) and check if they already bought a plan (`active_product`).

#### Endpoint
```http
GET https://oxxy.sharyx.ai/api/v1/Actions/LookupCustomer?wa_number={{wa_number}}
```

#### Query Parameters
- `wa_number` (string, required): Customer mobile number (e.g. `919840012345`).

#### Response Example
```json
{
  "customer_id": "511f3b99-db54-4ee4-9db2-d36296b94988",
  "first_name": "Ravi",
  "wa_number": "919840012345",
  "language": "en",
  "active_product": null,
  "active_plan": null,
  "opted_out": false,
  "consent": {
    "whatsapp_consent": true,
    "health_data_consent": false
  },
  "open_bookings": []
}
```

> [!IMPORTANT]
> If `active_product` is already `"oxxy"`, the agent must **not** sell a new plan; it should ask how it can help with their existing membership.

---

### Tool 2: `get_official_plan`

#### Purpose
Retrieves real-time pricing, GST breakdown, coverage details, and discount rules. **The Voice Agent must never quote prices from memory.**

#### When to Call (Trigger)
- Customer asks: *"How much does it cost?"*, *"What are the plan charges?"*, or *"Tell me about the Vital/Infinity plan"*.
- Right before the Voice Agent makes a formal plan recommendation.

#### Endpoint
```http
GET https://oxxy.sharyx.ai/api/v1/Actions/OfficialPlan?product=oxxy&plan={{plan}}&billing={{billing}}
```

#### Query Parameters
- `product` (string, required): `"oxxy"`
- `plan` (string, required): One of `"everyday"`, `"vital"`, `"thrive"`, `"infinity"`.
- `billing` (string, optional): `"yearly"` (default) or `"monthly"`.

#### Response Example
```json
{
  "product": "oxxy",
  "plan": "vital",
  "billing": "yearly",
  "base_price": 4999,
  "gst_rate": 0.18,
  "gst_amount": 900,
  "total_price": 5899,
  "summary": "Covers doctor consultations, diagnostics, pharmacy discounts, and planned surgeries up to 4 family members.",
  "activation_link": "https://www.oxxy.in/#plan"
}
```

---

### Tool 3: `search_centres`

#### Purpose
Searches the verified hospital, clinic, and pathology lab directory. **Automatic Fallback:** If the Oxxy directory is empty in that locality or city, it automatically falls back to **Google Maps Places** and returns real nearby private clinics/hospitals as **"nearby private options" (not Oxxy partners)**.

#### When to Call (Trigger)
- Customer asks: *"Do you have hospitals in Anna Nagar, Chennai?"*, *"Which dental clinic is nearby?"*, or *"Can I use this at Apollo or Fortis?"*.

#### Endpoint
```http
GET https://oxxy.sharyx.ai/api/v1/Actions/SearchCentres?city={{city}}&locality={{locality}}&specialisation={{specialisation}}&radius_km={{radius_km}}
```

#### Query Parameters
- `city` (string, required if no coordinates): City name (e.g. `"Chennai"`, `"Delhi"`).
- `locality` (string, optional): Specific area or landmark (e.g. `"Anna Nagar"`).
- `specialisation` (string, optional): E.g. `"dental"`, `"eye"`, `"cardiology"`, `"orthopedic"`, `"general"`.
- `radius_km` (number, optional): Search radius (default `10`).

#### Response Example (with Automatic Google Places Fallback)
```json
{
  "count": 3,
  "radius_km": 10,
  "source": "google_places",
  "is_directory_partner": false,
  "note": "No Oxxy partner centres in directory for Chennai. Showing 3 nearby private options (not Oxxy partners).",
  "centres": [
    {
      "centre_id": null,
      "name": "Dental Junction Clinic",
      "branch": null,
      "locality": "Plot No : 966, Shop No : 5",
      "city": "Chennai",
      "type": "clinic",
      "specialisations": ["general"],
      "distance_km": 0,
      "private_status_verified": false,
      "is_partner": false,
      "option_type": "nearby_private_option",
      "address": "Plot No : 966, Shop No : 5, T.V.S Colony . Anna Nagar West Extn, Chennai",
      "verification_source": "google_places"
    }
  ]
}
```

#### Voice Agent Prompt Instructions for Centres:
- **If `is_partner: true` (`option_type: "oxxy_partner"`):** The Voice Agent says: *"Anna Nagar-la Oxxy verified partner clinic Apollo Clinic irukku, ungalukku anga guaranteed discount kedaikkum."*
- **If `is_partner: false` (`option_type: "nearby_private_option"`):** **Never call them Oxxy partners.** The Voice Agent says: *"Andha area-la direct Oxxy partners illai, aana ungalukku nearby private options-ah Dental Junction Clinic irukku. Ungalukku Oxxy discounts check panni appointment slot arrange pannattuma?"*

---

### Tool 4: `send_voice_template` (Real-Time WhatsApp Trigger)

#### Purpose
Sends an official Meta-approved WhatsApp template to the customer **in real time while the phone call is active**.

#### When to Call (Trigger)
1. **Case A (Customer asks for proof/credibility):** Customer says: *"Is Oxxy real?"*, *"Send me your license or customer reviews"*, or *"Where can I see reviews?"*  
   👉 Call with `template: "oxxy_verification_links"`
2. **Case B (Customer asks for plan details during call):** Customer says: *"Send plan details to my WhatsApp right now"*, *"Can you share the plan on WhatsApp while I'm talking?"*  
   👉 Call with `template: "plan_recommendation_status"`

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/SendTemplate
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "template": "plan_recommendation_status",
  "whatsapp_consent": true,
  "consent_source": "voice_ai",
  "params": {
    "customer_name": "Ravi",
    "requirement": "mother dental treatment",
    "plan": "Vital",
    "reason": "it offers instant discount on dental procedures with no waiting period"
  },
  "call_id": "call_1234567890",
  "context": {
    "ad_campaign": "meta_lead_dental"
  }
}
```

#### Field Specifications & Constraints
- `template`: MUST be either `"oxxy_verification_links"` or `"plan_recommendation_status"`.
- `whatsapp_consent`: MUST be `true` (customer explicitly asked for it).
- `consent_source`: MUST be `"voice_ai"`.
- `params.plan`: MUST be one of: `"Everyday"`, `"Vital"`, `"Thrive"`, `"Infinity"`.
- **Meta Sanitization Rules for `params`:**
  - `customer_name`: Max 40 characters.
  - `requirement`: Max 120 characters. No newlines, tabs, or prices (no `₹`, `Rs`, `INR`).
  - `reason`: Max 200 characters. No newlines, tabs, URLs, or prices.

#### Response Example
```json
{
  "ok": true,
  "wa_message_id": "wamid.HBgMOTE5ODQwMDEyMzQ1FQIAERgSRjQ2...",
  "template": "plan_recommendation_status",
  "sent_to": "919840012345"
}
```

> [!TIP]
> After invoking `send_voice_template`, the Voice Agent should verbally confirm on the call:  
> *"I have just sent the plan details to your WhatsApp right now. You can check your screen while we speak."*

---

### Tool 5: `start_conversation` (Post-Call Handoff)

#### Purpose
Concludes the voice call and passes full conversation intelligence (need, beneficiary, city, notes) to the WhatsApp AI Chatbot. The chatbot sends the first interactive card to continue the customer journey.

#### When to Call (Trigger)
- At the **end of the voice call**, after the agent says goodbye and the customer has agreed to receive follow-up information on WhatsApp.

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/StartConversation
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "first_name": "Ravi",
  "whatsapp_consent": true,
  "consent_source": "voice_ai",
  "language": "en",
  "context": {
    "summary": "Customer Ravi enquired about healthcare savings for his mother's cataract surgery in Chennai. Recommended Oxxy Vital.",
    "need": "cataract surgery",
    "beneficiary": "mother",
    "city": "Chennai",
    "specialisation": "eye",
    "selected_product": "oxxy"
  }
}
```

#### Response Example
```json
{
  "ok": true,
  "status": "sent",
  "conversation_id": "893c8340-9f5b-410a-b6b8-67a5015bbf08",
  "wa_message_id": "wamid.HBgMOTE5ODQwMDEyMzQ1..."
}
```

---

### Tool 6: `create_booking_request`

#### Purpose
Captures an appointment booking request for a hospital or diagnostic centre.

#### When to Call (Trigger)
- Customer says: *"Please book an appointment for me at Apollo Clinic Anna Nagar on 28th Nov around 10 AM"*.

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/BookingRequests
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "centre": "Apollo Clinic",
  "branch": "Anna Nagar",
  "city": "Chennai",
  "specialisation": "dental",
  "preferred_date": "2026-11-28",
  "preferred_time": "10:30",
  "patient_name": "Sita Devi",
  "notes": "Mother dental consultation",
  "source": "voice_ai"
}
```

#### Rules & Constraints
- `preferred_date`: Format `YYYY-MM-DD`. Must be within the booking window (at least 3 days from today, up to 6 months).
- `preferred_time`: Format `HH:mm` (24h).

#### Response Example
```json
{
  "ok": true,
  "booking_request_id": "a6967c0c-...",
  "status": "pending_confirmation",
  "message": "Booking request recorded. Sales team will confirm within 2 hours."
}
```

---

### Tool 7: `create_follow_up`

#### Purpose
Schedules an automated WhatsApp callback or follow-up reminder.

#### When to Call (Trigger)
- Customer is busy or driving and says: *"I'm in a meeting, call me tomorrow at 3 PM"*, or *"Talk to me on Friday"*.

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/FollowUps
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "scheduled_for": "2026-11-26T15:00:00+05:30",
  "reason": "Customer busy in meeting; requested callback",
  "selected_product": "oxxy",
  "source": "voice_ai"
}
```

#### Constraints
- `scheduled_for`: ISO 8601 string. **Must fall between 09:00 and 21:00 IST** (quiet hours policy strictly enforced).

---

### Tool 8: `set_opt_out`

#### Purpose
Marks the customer as Do-Not-Disturb (DND) / Opted-out in the database.

#### When to Call (Trigger)
- Customer says: *"Do not call me again"*, *"Stop calling"*, *"Remove my number"*, or *"I am reporting this as spam"*.

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/OptOut
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "reason": "customer_requested_opt_out",
  "source": "voice_ai"
}
```

#### Response Example
```json
{
  "ok": true,
  "opted_out": true,
  "opted_out_at": "2026-11-25T09:50:00Z"
}
```

> [!CAUTION]
> Once `set_opt_out` is executed, the Voice Agent must immediately stop pitching, apologize for the disturbance, say goodbye, and terminate the call.

---

### Tool 9: `create_escalation`

#### Purpose
Immediately flags an urgent issue and assigns an escalation ticket to a human manager.

#### When to Call (Trigger)
- **Medical Emergency:** Customer or family member is experiencing severe acute chest pain, bleeding, accident, or seeking immediate ambulance/ICU admission.
- **Legal Threats:** Customer threatens legal action, police complaint, or consumer court.
- **Severe Grievance:** Unresolved money deduction or prior scam allegations.

#### Endpoint
```http
POST https://oxxy.sharyx.ai/api/v1/Actions/Escalations
```

#### Request Payload Schema
```json
{
  "wa_number": "919840012345",
  "priority": "urgent",
  "reason": "medical_emergency",
  "summary": "Customer reported chest pain and asked for emergency ICU admission. Advised nearest hospital emergency room.",
  "source": "voice_ai"
}
```

#### Voice Bot Speech Directive for Emergencies
> *"Sir/Madam, if this is a medical emergency, please immediately visit the nearest hospital emergency room or dial 108/112 for an ambulance. I am escalating this to our senior healthcare team right now."*

---

## 4. Voice Agent Provider JSON Tool Declarations (OpenAI / Vapi / Retell Format)

You can provide the following JSON tool declarations directly to your Voice AI platform:

```json
[
  {
    "type": "function",
    "function": {
      "name": "lookup_customer",
      "description": "Look up existing customer profile, name, consent, active plans, and open bookings before or at start of call.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string", "description": "Customer mobile number e.g. 919840012345" }
        },
        "required": ["wa_number"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "get_official_plan",
      "description": "Fetch official plan price, GST, benefits and activation URL. Never quote prices from memory.",
      "parameters": {
        "type": "object",
        "properties": {
          "plan": { "type": "string", "enum": ["everyday", "vital", "thrive", "infinity"], "description": "Plan name" },
          "billing": { "type": "string", "enum": ["yearly", "monthly"], "default": "yearly", "description": "Billing cadence" }
        },
        "required": ["plan"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "search_centres",
      "description": "Search verified partner hospitals, diagnostic labs, or clinics by city and specialization.",
      "parameters": {
        "type": "object",
        "properties": {
          "city": { "type": "string", "description": "City name, e.g. Chennai, Delhi, Mumbai" },
          "specialisation": { "type": "string", "description": "Medical department e.g. dental, eye, cardiology, general" },
          "radius_km": { "type": "number", "default": 10, "description": "Search radius in km" }
        },
        "required": ["city"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "send_voice_template",
      "description": "Send a real-time official WhatsApp template while on the phone call when customer asks for links, proof or plan details.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string", "description": "Customer mobile number" },
          "template": { "type": "string", "enum": ["oxxy_verification_links", "plan_recommendation_status"], "description": "Template to trigger" },
          "customer_name": { "type": "string", "description": "Customer first name" },
          "requirement": { "type": "string", "description": "Healthcare requirement e.g. dental treatment, knee surgery" },
          "plan": { "type": "string", "enum": ["Everyday", "Vital", "Thrive", "Infinity"], "description": "Plan name recommended" },
          "reason": { "type": "string", "description": "Brief reason why this plan is suitable (no prices, no newlines)" }
        },
        "required": ["wa_number", "template", "requirement", "plan", "reason"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "start_conversation",
      "description": "Handoff to WhatsApp AI chatbot at the end of the voice call with call summary and extracted context.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string", "description": "Customer mobile number" },
          "first_name": { "type": "string", "description": "Customer first name" },
          "summary": { "type": "string", "description": "Call notes and what was discussed" },
          "need": { "type": "string", "description": "Customer healthcare need" },
          "beneficiary": { "type": "string", "description": "Who needs care: self, mother, father, child, family" },
          "city": { "type": "string", "description": "Customer city" }
        },
        "required": ["wa_number", "summary", "need"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "create_booking_request",
      "description": "Record an appointment booking request for a customer at a chosen centre, date and time.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string" },
          "centre": { "type": "string", "description": "Hospital or clinic name" },
          "branch": { "type": "string", "description": "Area or branch name" },
          "city": { "type": "string" },
          "specialisation": { "type": "string" },
          "preferred_date": { "type": "string", "description": "Date YYYY-MM-DD" },
          "preferred_time": { "type": "string", "description": "Time HH:mm" },
          "patient_name": { "type": "string" }
        },
        "required": ["wa_number", "centre", "city", "preferred_date"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "create_follow_up",
      "description": "Schedule a follow-up callback or reminder when customer is busy.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string" },
          "scheduled_for": { "type": "string", "description": "ISO 8601 timestamp between 09:00 and 21:00 IST" },
          "reason": { "type": "string" }
        },
        "required": ["wa_number", "scheduled_for", "reason"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "set_opt_out",
      "description": "Mark customer as Do Not Call / Opt-out when they ask not to be contacted.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string" },
          "reason": { "type": "string" }
        },
        "required": ["wa_number"]
      }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "create_escalation",
      "description": "Escalate to a human manager for medical emergencies, legal complaints or serious service failures.",
      "parameters": {
        "type": "object",
        "properties": {
          "wa_number": { "type": "string" },
          "priority": { "type": "string", "enum": ["normal", "urgent"] },
          "reason": { "type": "string" },
          "summary": { "type": "string" }
        },
        "required": ["wa_number", "priority", "reason", "summary"]
      }
    }
  }
]
```

---

## 5. Voice Agent Operational Playbook & Guardrails

1. **Pre-Call Verification:**
   Before saying anything, run `lookup_customer`. If `opted_out` is `true`, do not proceed.
2. **Never Invent Pricing:**
   Do not quote discounts or prices from LLM training data. Always invoke `get_official_plan`.
3. **Real-time WhatsApp Bridge:**
   When the customer is on the phone and asks: *"Can you WhatsApp me the link?"*, the agent calls `send_voice_template` immediately and states: *"I have sent it to your WhatsApp just now. Please take a look while we talk."*
4. **End-of-Call Handoff:**
   Whenever the call finishes normally, invoke `start_conversation` so the customer seamlessly receives the WhatsApp chat options (`Reduce My Bill` / `Book Appointment`).
5. **DND / Compliance:**
   When a customer says *"Stop calling"*, immediately trigger `set_opt_out`, politely apologize, and hang up.
