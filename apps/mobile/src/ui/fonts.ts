import { Fredoka_600SemiBold, Fredoka_700Bold } from "@expo-google-fonts/fredoka";
import { Nunito_400Regular, Nunito_600SemiBold, Nunito_700Bold } from "@expo-google-fonts/nunito";
import { useFonts } from "expo-font";

/** Loads the two faces from docs/DESIGN.md. True once ready, or after an error, so the app never blocks on a font. */
export function useAppFonts(): boolean {
  const [loaded, error] = useFonts({
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    Nunito_400Regular,
    Nunito_600SemiBold,
    Nunito_700Bold,
  });
  return loaded || !!error;
}
