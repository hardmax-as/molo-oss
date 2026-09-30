import { useT } from "~/lib/i18n.tsx";

export interface AgeFieldsValue {
  birthYear: string;
  country: string;
  ageReached: boolean;
}

export function AgeFields({
  value,
  onChange,
}: {
  value: AgeFieldsValue;
  onChange: (value: AgeFieldsValue) => void;
}) {
  const t = useT();
  const minimum = value.country === "ZA" ? 18 : 13;
  const boundary =
    value.country !== "" && Number(value.birthYear) === new Date().getUTCFullYear() - minimum;
  const field =
    "mt-1 w-full rounded-2xl border-2 border-mist-soft bg-cloud px-4 py-3 text-base text-ink focus:border-sun";
  return (
    <fieldset className="space-y-3">
      <legend className="font-semibold text-indigo">{t("age.title")}</legend>
      <p className="text-xs text-mist">{t("age.privacy")}</p>
      <label className="block text-sm font-semibold text-indigo">
        {t("age.birthYear")}
        <input
          name="birthYear"
          type="number"
          min="1900"
          max={new Date().getUTCFullYear()}
          required
          autoComplete="bday-year"
          className={field}
          value={value.birthYear}
          onChange={(e) => onChange({ ...value, birthYear: e.target.value, ageReached: false })}
        />
      </label>
      <label className="block text-sm font-semibold text-indigo">
        {t("age.country")}
        <select
          name="country"
          required
          className={field}
          value={value.country}
          onChange={(e) => onChange({ ...value, country: e.target.value, ageReached: false })}
        >
          <option value="">{t("age.chooseCountry")}</option>
          <option value="ZA">{t("age.southAfrica")}</option>
          <option value="NO">{t("age.norway")}</option>
          <option value="OTHER">{t("age.otherCountry")}</option>
        </select>
      </label>
      {boundary && (
        <label className="flex items-start gap-2 text-sm text-indigo">
          <input
            type="checkbox"
            required
            checked={value.ageReached}
            onChange={(e) => onChange({ ...value, ageReached: e.target.checked })}
          />
          {t("age.confirmAge", { age: minimum })}
        </label>
      )}
    </fieldset>
  );
}
