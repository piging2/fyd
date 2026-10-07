/**
 * Pre-obligation byte-identity baseline for answerVisitorConcierge.
 * Recorded from the branch-chain implementation before the item-7
 * refactor (2026-10-07). Single-intent answers must match byte-for-byte.
 * Questions whose behavior intentionally changed (decompose instead of
 * the multi-topic bail-out) are excluded and covered by dedicated tests.
 */
export const BASELINE: Record<string, null | {
  answer: string;
  unknowns: string[];
  partial: boolean;
  claims: { claim: string; classification: string; evidenceRefIds: string[] }[];
}> = {
  "How do I contact them?": {
    "answer": "Call 970-245-3869 to discuss your needs. [1]\n\nTheir website is https://coppersmithplumbing.com. [2]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "What is their phone number?": {
    "answer": "Call 970-245-3869 to discuss your needs. [1]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      }
    ]
  },
  "What is their email?": {
    "answer": "I don’t have a published contact method for this business.",
    "unknowns": [
      "I don’t have a published contact method for this business."
    ],
    "partial": true,
    "claims": []
  },
  "Where are they located?": {
    "answer": "They are based in Grand Junction, Colorado, 81501, United States. [1]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "They are based in Grand Junction, Colorado, 81501, United States.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#locality"
        ]
      }
    ]
  },
  "What is their service area?": {
    "answer": "I can’t confirm coverage for a particular address. Contact the business to check.\n\nTheir website says: “Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years.” [1]\n\nThey are based in Grand Junction, Colorado, 81501, United States. [2]",
    "unknowns": [
      "I can’t confirm coverage for a particular address. Contact the business to check."
    ],
    "partial": false,
    "claims": [
      {
        "claim": "Their website says: “Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years.”",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#description"
        ]
      },
      {
        "claim": "They are based in Grand Junction, Colorado, 81501, United States.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#locality"
        ]
      }
    ]
  },
  "What are their hours?": {
    "answer": "Their published hours are Mo,Tu,We,Th,Fr 07:30-16:00. [1]\n\nCall 970-245-3869 to discuss your needs. [2]\n\nTheir website is https://coppersmithplumbing.com. [3]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Their published hours are Mo,Tu,We,Th,Fr 07:30-16:00.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#hours"
        ]
      },
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "Do they do emergency plumbing?": {
    "answer": "I can’t confirm emergency or after-hours availability from the published information I have.\n\nCall 970-245-3869 to discuss your needs. [1]\n\nTheir website is https://coppersmithplumbing.com. [2]",
    "unknowns": [
      "I can’t confirm emergency or after-hours availability from the published information I have."
    ],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "Do they offer emergency heat-pump repair?": {
    "answer": "I can’t confirm emergency or after-hours availability from the published information I have.\n\nCall 970-245-3869 to discuss your needs. [1]\n\nTheir website is https://coppersmithplumbing.com. [2]",
    "unknowns": [
      "I can’t confirm emergency or after-hours availability from the published information I have."
    ],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "What services do they offer?": null,
  "Can they help with my AC?": {
    "answer": "Their Heating & Cooling service says: “We maintain or repair furnaces, air conditioning units, heat pumps, mini split systems and more.” [1][2][3]\n\nCall 970-245-3869 to discuss your needs. [4]\n\nTheir website is https://coppersmithplumbing.com. [5]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Their Heating & Cooling service says: “We maintain or repair furnaces, air conditioning units, heat pumps, mini split systems and more.”",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175-service-2dbc12c16f83#title",
          "website-business-2f1327c09d622175-service-2dbc12c16f83#description",
          "rel-095378b4d4a047a4"
        ]
      },
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "Do they do plumbing?": {
    "answer": "Their Plumbing service says: “Are you working on new construction for residential homes or commercial buildings?” [1][2][3]\n\nCall 970-245-3869 to discuss your needs. [4]\n\nTheir website is https://coppersmithplumbing.com. [5]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Their Plumbing service says: “Are you working on new construction for residential homes or commercial buildings?”",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175-service-139408827c27#title",
          "website-business-2f1327c09d622175-service-139408827c27#description",
          "rel-f450fdb901a6baa3"
        ]
      },
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "I have water leaking under my sink. Can they help?": {
    "answer": "I can’t confirm that particular service from the published information I have.\n\nThe business will need to confirm whether it can help with your specific problem.\n\nCall 970-245-3869 to discuss your needs. [1]\n\nTheir website is https://coppersmithplumbing.com. [2]",
    "unknowns": [
      "I can’t confirm that particular service from the published information I have.",
      "The business will need to confirm whether it can help with your specific problem."
    ],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "Do you have free estimates?": null,
  "Can they help with AI call answering?": {
    "answer": "I can’t confirm that particular service from the published information I have.\n\nCall 970-245-3869 to discuss your needs. [1]\n\nTheir website is https://coppersmithplumbing.com. [2]",
    "unknowns": [
      "I can’t confirm that particular service from the published information I have."
    ],
    "partial": false,
    "claims": [
      {
        "claim": "Call 970-245-3869 to discuss your needs.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#phone"
        ]
      },
      {
        "claim": "Their website is https://coppersmithplumbing.com.",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#website"
        ]
      }
    ]
  },
  "What does Coppersmith do?": {
    "answer": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team [1]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#description"
        ]
      }
    ]
  },
  "Tell me about this business": {
    "answer": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team [1]",
    "unknowns": [],
    "partial": false,
    "claims": [
      {
        "claim": "Coppersmith Plumbing & HVAC has serviced Western Colorado for over 25 years. With a proven track record of quality work and diverse skill sets, our team",
        "classification": "website_statement",
        "evidenceRefIds": [
          "website-business-2f1327c09d622175#description"
        ]
      }
    ]
  },
  "plumbing and heating": null,
};
