import {beforeEach, describe, expect, it} from 'vitest';
import {LayoutService} from '../LayoutService';
import {TemplateService} from '../TemplateService';
import {factories, getPrismaClient} from '../../../../../test/helpers';

const SLOT_BODY = '<html><body>{{contentSlot}}</body></html>';

describe('LayoutService', () => {
  let projectId: string;
  const prisma = getPrismaClient();

  beforeEach(async () => {
    const {project} = await factories.createUserWithProject();
    projectId = project.id;
  });

  describe('create', () => {
    it('creates a layout with the supplied fields', async () => {
      const layout = await LayoutService.create(projectId, {name: 'Brand', body: SLOT_BODY});
      expect(layout.name).toBe('Brand');
      expect(layout.body).toBe(SLOT_BODY);
      expect(layout.isDefault).toBe(false);
      expect(layout.projectId).toBe(projectId);
    });

    it('clears the prior default when creating a new default', async () => {
      const first = await LayoutService.create(projectId, {name: 'A', body: SLOT_BODY, isDefault: true});
      const second = await LayoutService.create(projectId, {name: 'B', body: SLOT_BODY, isDefault: true});

      const reloadedFirst = await LayoutService.get(projectId, first.id);
      expect(reloadedFirst.isDefault).toBe(false);
      expect(second.isDefault).toBe(true);

      // Exactly one default remains.
      const defaults = await prisma.layout.count({where: {projectId, isDefault: true}});
      expect(defaults).toBe(1);
    });
  });

  describe('get / getDefault', () => {
    it('throws 404 for a missing layout', async () => {
      await expect(LayoutService.get(projectId, 'does-not-exist')).rejects.toMatchObject({code: 404});
    });

    it('returns null when no default layout is set', async () => {
      await LayoutService.create(projectId, {name: 'Plain', body: SLOT_BODY});
      expect(await LayoutService.getDefault(projectId)).toBeNull();
    });

    it('returns the default layout when one exists', async () => {
      const def = await LayoutService.create(projectId, {name: 'Def', body: SLOT_BODY, isDefault: true});
      const found = await LayoutService.getDefault(projectId);
      expect(found?.id).toBe(def.id);
    });
  });

  describe('update', () => {
    it('updates name and body', async () => {
      const layout = await LayoutService.create(projectId, {name: 'Old', body: SLOT_BODY});
      const updated = await LayoutService.update(projectId, layout.id, {
        name: 'New',
        body: '<main>{{contentSlot}}</main>',
      });
      expect(updated.name).toBe('New');
      expect(updated.body).toBe('<main>{{contentSlot}}</main>');
    });

    it('demotes the sibling default when promoting another layout to default', async () => {
      const a = await LayoutService.create(projectId, {name: 'A', body: SLOT_BODY, isDefault: true});
      const b = await LayoutService.create(projectId, {name: 'B', body: SLOT_BODY});

      await LayoutService.update(projectId, b.id, {isDefault: true});

      expect((await LayoutService.get(projectId, a.id)).isDefault).toBe(false);
      expect((await LayoutService.get(projectId, b.id)).isDefault).toBe(true);
    });
  });

  describe('delete', () => {
    it('deletes a layout with no referencing templates', async () => {
      const layout = await LayoutService.create(projectId, {name: 'Tmp', body: SLOT_BODY});
      await LayoutService.delete(projectId, layout.id);
      await expect(LayoutService.get(projectId, layout.id)).rejects.toMatchObject({code: 404});
    });

    it('refuses with 400 when a template still references the layout', async () => {
      const layout = await LayoutService.create(projectId, {name: 'InUse', body: SLOT_BODY});
      await TemplateService.create(projectId, {
        name: 'T',
        subject: 'S',
        body: '<p>hi</p>',
        from: 'a@example.com',
        layoutId: layout.id,
      });

      await expect(LayoutService.delete(projectId, layout.id)).rejects.toMatchObject({code: 400});
      // Layout still present.
      expect((await LayoutService.get(projectId, layout.id)).id).toBe(layout.id);
    });
  });

  describe('resolveLayoutBody', () => {
    it('returns the explicit layout body when layoutId is given', async () => {
      const layout = await LayoutService.create(projectId, {name: 'X', body: SLOT_BODY});
      expect(await LayoutService.resolveLayoutBody(projectId, layout.id)).toBe(SLOT_BODY);
    });

    it('falls back to the project default when layoutId is null', async () => {
      await LayoutService.create(projectId, {name: 'Def', body: SLOT_BODY, isDefault: true});
      expect(await LayoutService.resolveLayoutBody(projectId, null)).toBe(SLOT_BODY);
    });

    it('returns null when no layoutId and no default', async () => {
      await LayoutService.create(projectId, {name: 'Plain', body: SLOT_BODY});
      expect(await LayoutService.resolveLayoutBody(projectId, null)).toBeNull();
    });

    it('does not resolve a layout from another project', async () => {
      const {project: other} = await factories.createUserWithProject();
      const foreign = await LayoutService.create(other.id, {name: 'Foreign', body: SLOT_BODY});
      // Asking with our projectId but a foreign layout id resolves to null.
      expect(await LayoutService.resolveLayoutBody(projectId, foreign.id)).toBeNull();
    });
  });

  describe('list', () => {
    it('includes a _count.templates usage count per layout', async () => {
      const layout = await LayoutService.create(projectId, {name: 'Used', body: SLOT_BODY});
      await TemplateService.create(projectId, {
        name: 'T1',
        subject: 'S',
        body: '<p>a</p>',
        from: 'a@example.com',
        layoutId: layout.id,
      });
      await TemplateService.create(projectId, {
        name: 'T2',
        subject: 'S',
        body: '<p>b</p>',
        from: 'a@example.com',
        layoutId: layout.id,
      });

      const result = await LayoutService.list(projectId);
      const row = result.data.find(l => l.id === layout.id);
      expect(row?._count.templates).toBe(2);
    });

    it('floats the default layout to the top by default ordering', async () => {
      await LayoutService.create(projectId, {name: 'Regular', body: SLOT_BODY});
      const def = await LayoutService.create(projectId, {name: 'TheDefault', body: SLOT_BODY, isDefault: true});

      const result = await LayoutService.list(projectId);
      expect(result.data[0]?.id).toBe(def.id);
    });

    it('honours an explicit name sort', async () => {
      await LayoutService.create(projectId, {name: 'Zeta', body: SLOT_BODY});
      await LayoutService.create(projectId, {name: 'Alpha', body: SLOT_BODY});

      const asc = await LayoutService.list(projectId, 1, 20, undefined, {field: 'name', direction: 'asc'});
      expect(asc.data.map(l => l.name)).toEqual(['Alpha', 'Zeta']);

      const desc = await LayoutService.list(projectId, 1, 20, undefined, {field: 'name', direction: 'desc'});
      expect(desc.data.map(l => l.name)).toEqual(['Zeta', 'Alpha']);
    });

    it('filters by search term (case-insensitive)', async () => {
      await LayoutService.create(projectId, {name: 'Newsletter Shell', body: SLOT_BODY});
      await LayoutService.create(projectId, {name: 'Receipt', body: SLOT_BODY});

      const result = await LayoutService.list(projectId, 1, 20, 'news');
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.name).toBe('Newsletter Shell');
    });
  });
});
