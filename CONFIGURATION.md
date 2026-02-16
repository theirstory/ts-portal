# Configuration Guide

This portal uses a centralized configuration system that allows different organizations to customize the application without modifying the source code. All configuration is stored in the `config.json` file at the project root.

## Table of Contents

- [Configuration File](#configuration-file)
- [Configuration Sections](#configuration-sections)
- [Customization Guide](#customization-guide)
- [Best Practices](#best-practices)
- [Usage in Code](#usage-in-code)
- [Validation](#validation)
- [Troubleshooting](#troubleshooting)

## Configuration File

### Location

`/config.json`

### Structure

```json
{
  "organization": { ... },
  "theme": { ... },
  "ner": { ... }
}
```

### Important Notes

- `config.json` is in `.gitignore` by default
- Use `config.example.json` as a reference
- Each organization maintains its own configuration
- Never commit sensitive information or credentials

## Configuration Sections

### 1. Organization

Configure your organization's information:

```json
{
  "organization": {
    "name": "Organization Archives",
    "displayName": "Research Portal",
    "description": "This collection contains recorded interviews..."
  }
}
```

**Fields:**

- `name`: Full organization name (appears in footer)
- `displayName`: Title displayed on main page
- `description`: Description shown below the title

### 2. Theme

Configure your application colors:

```json
{
  "theme": {
    "colors": {
      "primary": {
        "main": "#1976d2",
        "light": "#2196f3",
        "dark": "#1565c0",
        "contrastText": "#ffffff"
      },
      "secondary": { ... },
      "grey": { ... }
    }
  }
}
```

**Available Palettes:**

- `primary`: Main brand color
- `secondary`: Secondary/accent color
- `grey`: Grayscale (50-900)
- `text`: Text colors (primary, secondary, disabled)
- `background`: Background colors (default, paper, subtle)
- `error`, `warning`, `success`, `info`: Status colors
- `common`: Common colors (white, black, border, divider, etc.)

### 3. NER Labels

Configure Named Entity Recognition (NER) labels and their colors:

```json
{
  "ner": {
    "labels": [
      {
        "id": "named_person",
        "label": "named_person",
        "displayName": "Named Person",
        "color": "#FFCC80"
      }
    ],
    "fallbackColors": ["#D1C4E9", "#8FEBE8"]
  }
}
```

**Label Fields:**

- `id`: Unique identifier for the label
- `label`: Internal value used in code
- `displayName`: User-facing name
- `color`: Hexadecimal color associated with this label

**fallbackColors:**
Array of additional colors used when more colors are needed than defined labels.

## Customization Guide

### Step 1: Edit config.json

1. Open `/config.json`
2. Modify values according to your organization's needs:

```json
{
  "organization": {
    "name": "My Organization",
    "displayName": "My Org Research Portal",
    "description": "Welcome to our portal..."
  }
}
```

### Step 2: Customize Colors

Change theme colors to match your brand:

```json
{
  "theme": {
    "colors": {
      "primary": {
        "main": "#FF5733",
        "light": "#FF8A65",
        "dark": "#E64A19",
        "contrastText": "#ffffff"
      }
    }
  }
}
```

### Step 3: Adjust NER Labels (Optional)

If your organization uses different labels or colors:

```json
{
  "ner": {
    "labels": [
      {
        "id": "person",
        "label": "person",
        "displayName": "Person",
        "color": "#FF5733"
      }
    ]
  }
}
```

### Step 4: Restart the Application

After making changes to `config.json`, restart the development server:

```bash
yarn dev
```

## Best Practices

### Configuration Management

**✅ Do:**

- Keep `config.json` in `.gitignore`
- Use `config.example.json` as reference
- Validate configuration after changes (`yarn validate:config`)
- Backup your configuration before major updates
- Document important customizations

**❌ Don't:**

- Commit `config.json` to the repository
- Share credentials or sensitive information
- Use completely different colors for light/dark variations

### Color Customization

#### 1. Brand Consistency

**✅ Do:**

```json
{
  "primary": {
    "main": "#1976d2",
    "light": "#42a5f5",
    "dark": "#1565c0"
  }
}
```

Use light and dark variations of the same base color.

**❌ Don't:**

```json
{
  "primary": {
    "main": "#ff0000",
    "light": "#00ff00",
    "dark": "#0000ff"
  }
}
```

Don't use completely different colors for variations.

#### 2. Adequate Contrast

- Use dark colors on light backgrounds
- Use light colors on dark backgrounds
- Test with contrast tools (WCAG AA compliance)
- Recommended: [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)

#### 3. Limited Palette

Use 2-3 main colors and their variations:

```json
{
  "primary": { "main": "#1976d2" },
  "secondary": { "main": "#239B8B" },
  "error": { "main": "#d32f2f" }
}
```

### NER Labels

#### 1. Descriptive Names

**✅ Do:**

```json
{
  "id": "named_person",
  "label": "named_person",
  "displayName": "Named Person"
}
```

**❌ Don't:**

```json
{
  "id": "np",
  "label": "np",
  "displayName": "NP"
}
```

#### 2. Distinctive Colors

- Use colors that are easily distinguishable
- Avoid very similar colors for different labels
- Consider accessibility (color blindness)
- Tools: [Coolors.co](https://coolors.co), [Contrast Checker](https://webaim.org/resources/contrastchecker/)

#### 3. Logical Order

Organize labels alphabetically or by frequency of use:

```json
{
  "labels": [{ "label": "named_person" }, { "label": "location" }, { "label": "organization" }]
}
```

## Usage in Code

### Import Configuration

```typescript
// Import entire configuration
import { config } from '@/config/index';

// Import specific sections
import { organizationConfig, themeColors, nerLabels } from '@/config/index';

// Use in components
const MyComponent = () => {
  return <h1>{organizationConfig.displayName}</h1>;
};
```

### Utility Functions

```typescript
// Get configuration for a specific NER label
import { getNerLabelConfig } from '@/config/index';
const labelConfig = getNerLabelConfig('named_person');

// Get NER color map
import { getNerLabelColorMap } from '@/config/index';
const colorMap = getNerLabelColorMap();

// Get complete NER color palette
import { getNerColorPalette } from '@/config/index';
const palette = getNerColorPalette();
```

### Modified Files

The following files now use centralized configuration:

- `/lib/theme/colors.ts` - Reads colors from config
- `/components/AppTopBar/AppTopBar.tsx` - Uses organization information
- `/app/mappings/ner-entity-maps.tsx` - Uses NER color palette
- `/app/utils/generateColorMap.ts` - Maps labels to colors from config
- `/components/NerFilters.tsx` - Reads NER labels from config

## Validation

### Running the Validator

```bash
yarn validate:config
```

### Validation Rules

1. File must be valid JSON (no trailing commas, correct quotes)
2. All colors must be in hexadecimal format (#RRGGBB) or rgba format
3. URLs must start with http:// or https://
4. All required fields must be present
5. NER label IDs must be unique

### Testing Checklist

After configuring, verify:

- [ ] Application compiles without errors (`yarn type-check`)
- [ ] Configuration is valid (`yarn validate:config`)
- [ ] Main page displays correct name
- [ ] Colors are applied correctly
- [ ] NER labels appear with correct colors
- [ ] Links work correctly
- [ ] Text is readable on all backgrounds

## Troubleshooting

### Changes not reflected

**Solution:**

```bash
# Clear cache
rm -rf .next
# Restart server
yarn dev
```

### Incorrect colors

**Solution:**

1. Validate config: `yarn validate:config`
2. Verify hexadecimal format: `#RRGGBB`
3. Clear browser cache
4. Check import path: `@/config/index`

### Labels don't appear

**Solution:**

1. Verify that `ner.labels` is not empty
2. Verify each label has all required fields (id, label, displayName, color)
3. Verify label names match the data
4. Check console for errors

### Import errors

**Solution:**

1. Ensure imports use `@/config/index` (not just `@/config`)
2. Check `tsconfig.json` paths configuration
3. Restart TypeScript server in your IDE

## Deployment

### Pre-Deploy Checklist

- [ ] Configuration validated (`yarn validate:config`)
- [ ] Tests passing
- [ ] Environment variables configured
- [ ] `config.json` exists on server
- [ ] Configuration backup saved

### Environment Variables

The `config.json` handles UI configuration, but you still need:

```env
WEAVIATE_HOST_URL=...
WEAVIATE_ADMIN_KEY=...
```

## Additional Resources

- [Material-UI Colors](https://mui.com/material-ui/customization/color/)
- [WCAG Guidelines](https://www.w3.org/WAI/WCAG21/quickref/)
- [WebAIM Contrast Checker](https://webaim.org/resources/contrastchecker/)
- [Coolors - Color Palette Generator](https://coolors.co)

## Support

If you need help:

1. Review this documentation
2. Run `yarn validate:config` for diagnostics
3. Contact the TheirStory team

---

_Last updated: January 2026_
