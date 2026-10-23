export const applianceGroups: Record<string, string[]> = {
  "Ovens & outdoor": [
    "Conventional oven",
    "Fan-forced oven",
    "Toaster oven",
    "Pizza oven",
    "BBQ",
    "Gas grill",
    "Electric grill",
  ],
  Stovetops: [
    "Gas stovetop",
    "Electric stovetop",
    "Induction stovetop",
    "Electric frypan",
    "Wok",
  ],
  "Countertop cooking": [
    "Microwave",
    "Air fryer",
    "Slow cooker",
    "Electric pressure cooker",
    "Rice cooker",
    "Multicooker",
    "Sandwich press",
    "Toaster",
    "Deep fryer",
    "Steamer",
    "Sous vide cooker",
    "Food dehydrator",
    "Thermomix or similar cooking machine",
  ],
  "Food preparation": [
    "Blender",
    "Stick blender",
    "Food processor",
    "Stand mixer",
    "Hand mixer",
    "Bread maker",
  ],
};
// Legacy generic requirements remain valid. Only equivalent equipment with the same
// instructions is accepted; an air fryer is not silently substituted for an oven.
export function supports(required: string, available: string[]) {
  if (available.includes(required)) return true;
  if (required === "Hob")
    return ["Gas stovetop", "Electric stovetop", "Induction stovetop"].some(
      (a) => available.includes(a),
    );
  if (required === "Oven") return available.includes("Conventional oven");
  return false;
}
