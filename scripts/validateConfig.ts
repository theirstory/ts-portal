#!/usr/bin/env node

/**
 * Configuration Validator
 *
 * This script validates the config.json file to ensure it has all required fields
 * and correct formats.
 *
 * Usage: ts-node scripts/validateConfig.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CONFIG_PATH = path.join(__dirname, '..', 'config.json');

// Color validation regex
const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;
const RGBA_COLOR_REGEX = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;

// Types
interface NerLabel {
  id: string;
  label: string;
  displayName: string;
  color: string;
}

interface ThemeColors {
  primary?: {
    main?: string;
    light?: string;
    dark?: string;
    contrastText?: string;
  };
  secondary?: {
    main?: string;
    light?: string;
    dark?: string;
    contrastText?: string;
  };
  grey?: Record<string, string>;
  common?: Record<string, string>;
}

interface Config {
  organization?: {
    name?: string;
    displayName?: string;
    description?: string;
  };
  theme?: {
    colors?: ThemeColors;
  };
  ner?: {
    labels?: NerLabel[];
    fallbackColors?: string[];
  };
}

// Validation results
const errors: string[] = [];
const warnings: string[] = [];

function validateColor(color: unknown, path: string): boolean {
  if (typeof color !== 'string') {
    errors.push(`${path}: Color must be a string, got ${typeof color}`);
    return false;
  }

  if (!HEX_COLOR_REGEX.test(color) && !RGBA_COLOR_REGEX.test(color)) {
    errors.push(`${path}: Invalid color format "${color}". Use hex (#RRGGBB) or rgba format`);
    return false;
  }

  return true;
}

function validateOrganization(config: Config): void {
  const org = config.organization;

  if (!org) {
    errors.push('Missing required section: organization');
    return;
  }

  const required: (keyof typeof org)[] = ['name', 'displayName', 'description'];

  required.forEach((field) => {
    if (!org[field]) {
      errors.push(`organization.${field}: Required field is missing`);
    } else if (typeof org[field] !== 'string') {
      errors.push(`organization.${field}: Must be a string, got ${typeof org[field]}`);
    }
  });
}

function validateTheme(config: Config): void {
  const theme = config.theme;

  if (!theme) {
    errors.push('Missing required section: theme');
    return;
  }

  if (!theme.colors) {
    errors.push('Missing required section: theme.colors');
    return;
  }

  const colors = theme.colors;

  // Validate primary colors
  if (colors.primary) {
    (['main', 'light', 'dark', 'contrastText'] as const).forEach((shade) => {
      if (colors.primary?.[shade]) {
        validateColor(colors.primary[shade], `theme.colors.primary.${shade}`);
      }
    });
  } else {
    warnings.push('theme.colors.primary: Recommended to define primary colors');
  }

  // Validate secondary colors
  if (colors.secondary) {
    (['main', 'light', 'dark', 'contrastText'] as const).forEach((shade) => {
      if (colors.secondary?.[shade]) {
        validateColor(colors.secondary[shade], `theme.colors.secondary.${shade}`);
      }
    });
  }

  // Validate grey scale
  if (colors.grey) {
    const greyShades = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900'];
    greyShades.forEach((shade) => {
      if (colors.grey?.[shade]) {
        validateColor(colors.grey[shade], `theme.colors.grey.${shade}`);
      }
    });
  }

  // Validate common colors
  if (colors.common) {
    Object.keys(colors.common).forEach((key) => {
      validateColor(colors.common![key], `theme.colors.common.${key}`);
    });
  }
}

function validateNer(config: Config): void {
  const ner = config.ner;

  if (!ner) {
    errors.push('Missing required section: ner');
    return;
  }

  if (!Array.isArray(ner.labels)) {
    errors.push('ner.labels: Must be an array');
    return;
  }

  if (ner.labels.length === 0) {
    warnings.push('ner.labels: Array is empty, at least one label is recommended');
  }

  const labelIds = new Set<string>();

  ner.labels.forEach((label, index) => {
    const path = `ner.labels[${index}]`;

    if (!label.id) {
      errors.push(`${path}.id: Required field is missing`);
    } else if (labelIds.has(label.id)) {
      errors.push(`${path}.id: Duplicate ID "${label.id}"`);
    } else {
      labelIds.add(label.id);
    }

    if (!label.label) {
      errors.push(`${path}.label: Required field is missing`);
    }

    if (!label.displayName) {
      errors.push(`${path}.displayName: Required field is missing`);
    }

    if (!label.color) {
      errors.push(`${path}.color: Required field is missing`);
    } else {
      validateColor(label.color, `${path}.color`);
    }
  });

  if (!Array.isArray(ner.fallbackColors)) {
    warnings.push('ner.fallbackColors: Should be an array of colors');
  } else {
    ner.fallbackColors.forEach((color, index) => {
      validateColor(color, `ner.fallbackColors[${index}]`);
    });
  }
}

function validateConfig(): void {
  console.log('🔍 Validating configuration...\n');

  // Check if config.json exists
  if (!fs.existsSync(CONFIG_PATH)) {
    console.error('❌ config.json not found!');
    console.log('💡 Create one from the example:');
    console.log('   cp config.example.json config.json\n');
    process.exit(1);
  }

  // Read and parse config
  let config: Config;
  try {
    const configContent = fs.readFileSync(CONFIG_PATH, 'utf8');
    config = JSON.parse(configContent);
  } catch (error) {
    console.error('❌ Failed to parse config.json:');
    console.error(`   ${(error as Error).message}\n`);
    process.exit(1);
  }

  // Validate sections
  validateOrganization(config);
  validateTheme(config);
  validateNer(config);

  // Print results
  console.log('📋 Validation Results:\n');

  if (errors.length === 0 && warnings.length === 0) {
    console.log('✅ Configuration is valid! No errors or warnings found.\n');
    process.exit(0);
  }

  if (errors.length > 0) {
    console.log(`❌ Found ${errors.length} error(s):\n`);
    errors.forEach((error, index) => {
      console.log(`   ${index + 1}. ${error}`);
    });
    console.log('');
  }

  if (warnings.length > 0) {
    console.log(`⚠️  Found ${warnings.length} warning(s):\n`);
    warnings.forEach((warning, index) => {
      console.log(`   ${index + 1}. ${warning}`);
    });
    console.log('');
  }

  if (errors.length > 0) {
    console.log('💡 Fix the errors above and run this script again.\n');
    console.log('📖 For more information, see CONFIGURATION.md\n');
    process.exit(1);
  } else {
    console.log('✅ Configuration is valid (with warnings).\n');
    process.exit(0);
  }
}

// Run validation
validateConfig();
