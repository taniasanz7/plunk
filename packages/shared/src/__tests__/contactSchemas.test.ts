import {describe, expect, it} from 'vitest';

import {ContactSchemas} from '../schemas/index.js';

describe('ContactSchemas.create', () => {
  it('preserves an omitted subscription value for existing-contact upserts', () => {
    const parsed = ContactSchemas.create.parse({
      email: 'existing@example.com',
      data: {phone: '+52...'},
    });

    expect(parsed.subscribed).toBeUndefined();
  });
});
