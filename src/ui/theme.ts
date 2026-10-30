import { Platform } from "react-native";

export const colors = {
  ink: "#263B36",
  muted: "#69776F",
  teal: "#287663",
  tealDark: "#1E5E4F",
  mint: "#EDF2E9",
  bg: "#F7F5F0",
  line: "#E5E8E0",
  white: "#FFFFFF",
  orange: "#BF9167",
  red: "#B75F59",
  paper: "#FCFBF8",
};
export const font = {
  regular: "DMSans_400Regular",
  medium: "DMSans_500Medium",
  bold: "DMSans_700Bold",
  heading: "Manrope_700Bold",
  extra: "Manrope_800ExtraBold",
  editorial: Platform.OS === "android" ? "serif" : "Georgia",
};
export const shadow = {
  shadowColor: "#183E30",
  shadowOffset: { width: 0, height: 3 },
  shadowOpacity: 0.035,
  shadowRadius: 14,
  elevation: 1,
};
export const categories = [
  "Family",
  "Friends",
  "School",
  "Community",
  "Hobby",
  "Other",
] as const;
