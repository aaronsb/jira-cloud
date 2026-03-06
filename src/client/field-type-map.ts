/**
 * Maps Jira custom field schema types to JSON Schema representations (ADR-201 §Schema Type Mapping).
 *
 * v1 supported types: string, number, date, single-select, multi-select, user picker, labels, URL.
 * Cascading selects and exotic types (assets, objects) are unsupported for writes.
 */

export type FieldCategory =
  | 'string'
  | 'number'
  | 'date'
  | 'datetime'
  | 'single-select'
  | 'multi-select'
  | 'user'
  | 'multi-user'
  | 'labels'
  | 'url'
  | 'unsupported';

export interface FieldTypeInfo {
  category: FieldCategory;
  writable: boolean;
  jsonSchema: Record<string, unknown>;
}

/** Suffix after the last ':' in the Jira custom field type URI */
const CUSTOM_TYPE_SUFFIX: Record<string, FieldCategory> = {
  textfield: 'string',
  textarea: 'string',
  float: 'number',
  datepicker: 'date',
  datetime: 'datetime',
  select: 'single-select',
  radiobuttons: 'single-select',
  multiselect: 'multi-select',
  multicheckboxes: 'multi-select',
  userpicker: 'user',
  multiuserpicker: 'multi-user',
  labels: 'labels',
  url: 'url',
  // Unsupported — recognized so we can label them explicitly
  cascadingselect: 'unsupported',
};

/** Fallback mapping from the schema `type` field when the custom URI isn't recognized */
const SCHEMA_TYPE_FALLBACK: Record<string, FieldCategory> = {
  string: 'string',
  number: 'number',
  date: 'date',
  datetime: 'datetime',
  user: 'user',
  option: 'single-select',
};

const JSON_SCHEMAS: Record<FieldCategory, Record<string, unknown>> = {
  string: { type: 'string' },
  number: { type: 'number' },
  date: { type: 'string', format: 'date' },
  datetime: { type: 'string', format: 'date-time' },
  'single-select': { type: 'string', description: 'Select from allowed values' },
  'multi-select': { type: 'array', items: { type: 'string', description: 'Select from allowed values' } },
  user: { type: 'string', description: 'Atlassian accountId' },
  'multi-user': { type: 'array', items: { type: 'string', description: 'Atlassian accountId' } },
  labels: { type: 'array', items: { type: 'string' } },
  url: { type: 'string', format: 'uri' },
  unsupported: {},
};

/**
 * Classify a Jira field schema into our type system.
 *
 * @param schemaType - The `schema.type` value (e.g. "string", "number", "array", "option")
 * @param customUri  - The `schema.custom` URI (e.g. "com.atlassian.jira.plugin.system.customfieldtypes:float")
 * @param items      - The `schema.items` value for array types
 */
export function classifyFieldType(
  schemaType: string,
  customUri?: string,
  items?: string,
): FieldTypeInfo {
  // Try the custom URI suffix first — most specific signal
  if (customUri) {
    const suffix = customUri.split(':').pop() || '';
    const category = CUSTOM_TYPE_SUFFIX[suffix];
    if (category) {
      return {
        category,
        writable: category !== 'unsupported',
        jsonSchema: JSON_SCHEMAS[category],
      };
    }
  }

  // For array types, check the items type
  if (schemaType === 'array' && items) {
    if (items === 'option') return typeInfo('multi-select');
    if (items === 'user') return typeInfo('multi-user');
    if (items === 'string') return typeInfo('labels');
  }

  // Fall back to schema type
  const fallback = SCHEMA_TYPE_FALLBACK[schemaType];
  if (fallback) {
    return typeInfo(fallback);
  }

  // Unrecognized — treat as unsupported (read-only on get, not suggested for writes)
  return typeInfo('unsupported');
}

function typeInfo(category: FieldCategory): FieldTypeInfo {
  return {
    category,
    writable: category !== 'unsupported',
    jsonSchema: JSON_SCHEMAS[category],
  };
}

/** Human-readable label for a field category */
export function categoryLabel(category: FieldCategory): string {
  switch (category) {
    case 'string': return 'text';
    case 'number': return 'number';
    case 'date': return 'date';
    case 'datetime': return 'date-time';
    case 'single-select': return 'select';
    case 'multi-select': return 'multi-select';
    case 'user': return 'user';
    case 'multi-user': return 'multi-user';
    case 'labels': return 'labels';
    case 'url': return 'URL';
    case 'unsupported': return 'unsupported';
  }
}
