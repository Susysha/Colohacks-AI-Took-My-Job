export const drugInteractionRules = [
  {
    id: "penicillin-cephalosporin",
    type: "allergy-medication",
    severity: "high",
    allergyKeywords: ["penicillin", "beta-lactam"],
    medicationKeywords: ["ceftriaxone", "cefixime", "amoxicillin", "ampicillin"],
    message: "Potential beta-lactam cross-reactivity detected."
  },
  {
    id: "warfarin-nsaid",
    type: "drug-drug",
    severity: "high",
    medicationKeywords: ["warfarin", "ibuprofen", "diclofenac", "naproxen"],
    message: "NSAID with warfarin increases bleeding risk."
  },
  {
    id: "insulin-beta-blocker",
    type: "drug-drug",
    severity: "medium",
    medicationKeywords: ["insulin", "metoprolol", "atenolol", "propranolol"],
    message: "Beta blockers can mask hypoglycemia symptoms."
  }
];

const toLower = (value = "") => value.toString().trim().toLowerCase();

const includesAny = (haystack, needles) =>
  needles.some((needle) => haystack.includes(toLower(needle)));

export function evaluateDrugInteractions({ allergies = [], medications = [] }) {
  const allergyText = allergies.map((item) => toLower(item.name || item)).join(" | ");
  const medicationText = medications
    .map((item) => `${toLower(item.name || item)} ${toLower(item.route || "")}`)
    .join(" | ");

  return drugInteractionRules
    .filter((rule) => {
      if (rule.type === "allergy-medication") {
        return (
          includesAny(allergyText, rule.allergyKeywords) &&
          includesAny(medicationText, rule.medicationKeywords)
        );
      }

      const hits = rule.medicationKeywords.filter((keyword) =>
        medicationText.includes(toLower(keyword))
      );

      return hits.length >= 2;
    })
    .map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      type: rule.type,
      message: rule.message
    }));
}

