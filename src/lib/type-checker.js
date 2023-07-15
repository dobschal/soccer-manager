import tv4 from 'tv4'

/**
 * The schema default is object, so you can directly enter properties
 *
 * @param {any} raw
 * @param {tv4.JsonSchema} schema
 */
export function checkType (raw, schema) {
  if (typeof schema.properties === 'undefined') {
    schema = {
      type: 'object',
      properties: schema
    }
  }
  schema.required = schema.required = []
  for (const key in schema.properties) {
    if (Object.hasOwnProperty.call(schema.properties, key)) {
      const element = schema.properties[key]
      if (element.required) {
        schema.required.push(key)
      }
    }
  }
  if (!tv4.validate(raw, schema, true)) {
    console.error('Validation Error: ', tv4.error)
    throw tv4.error
  }
}

export const OptionalNumber = {
  type: 'number'
}

export const RequiredNumber = {
  type: 'number',
  required: true
}

export const OptionalString = {
  type: 'string'
}

export const RequiredString = {
  type: 'string',
  required: true
}

export const OptionalObject = {
  type: 'object'
}
