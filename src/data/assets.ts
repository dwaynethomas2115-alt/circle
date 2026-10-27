import { Asset } from "expo-asset";
// Metro includes these files in native bundles and the web export. No remote
// image host is needed to render the first-run demo.
export function demoAssets(): Record<string, string> {
  const files: Record<string, number> = {
    forest: require("../../assets/photos/forest.jpg"),
    coast: require("../../assets/photos/coast.jpg"),
    camping: require("../../assets/photos/camping.jpg"),
    neighborhood: require("../../assets/photos/neighborhood.jpg"),
    library: require("../../assets/photos/library.jpg"),
    "avatar-alex": require("../../assets/photos/avatar-alex.jpg"),
    "avatar-maya": require("../../assets/photos/avatar-maya.jpg"),
    "avatar-sarah": require("../../assets/photos/avatar-sarah.jpg"),
    "avatar-james": require("../../assets/photos/avatar-james.jpg"),
    "avatar-daniel": require("../../assets/photos/avatar-daniel.jpg"),
    "avatar-ben": require("../../assets/photos/avatar-ben.jpg"),
  };
  return Object.fromEntries(
    Object.entries(files).map(([key, module]) => [
      key,
      Asset.fromModule(module).uri,
    ]),
  );
}
