<script lang="ts">
  import { m } from '#lib/paraglide/messages';
  import { getLocale, setLocale, type Locale } from '#lib/paraglide/runtime';
</script>

<!-- Each language is named in itself. setLocale saves the choice and reloads. -->
<select aria-label={m.lang_label()} value={getLocale()} onchange={(e) => setLocale(e.currentTarget.value as Locale)}>
  <option value="en">English</option>
  <option value="de">Deutsch</option>
  <option value="fr">Français</option>
</select>
