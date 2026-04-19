import { NextRequest, NextResponse } from 'next/server';
import { getSessionFromRequest } from '@/lib/auth';
import { query } from '@/lib/db';

interface ProjectRow {
  id: string;
  slug: string;
  name: string;
  owner_organization_id: string;
  org_slug: string;
  org_name: string;
  role: string;
}

export async function GET(req: NextRequest) {
  const session = await getSessionFromRequest(req);
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  // All projects the user has access to, via organization_members
  const projects = await query<ProjectRow>(
    `SELECT p.id, p.slug, p.name,
            p.owner_organization_id,
            o.slug AS org_slug, o.name AS org_name,
            om.role
     FROM organization_members om
     JOIN organizations o ON o.id = om.organization_id AND o.deleted_at IS NULL
     JOIN projects p ON p.owner_organization_id = om.organization_id AND p.deleted_at IS NULL
     WHERE om.user_id = $1
     ORDER BY o.created_at ASC, p.created_at ASC`,
    [session.sub]
  );

  const currentProject = session.projectId
    ? projects.find(p => p.id === session.projectId) ?? null
    : null;

  return NextResponse.json({
    id: session.sub,
    username: session.username,
    name: session.name,
    role: session.role,
    currentProject: currentProject
      ? {
          id: currentProject.id,
          slug: currentProject.slug,
          name: currentProject.name,
          organizationId: currentProject.owner_organization_id,
          organizationSlug: currentProject.org_slug,
          organizationName: currentProject.org_name,
          memberRole: currentProject.role,
        }
      : null,
    availableProjects: projects.map(p => ({
      id: p.id,
      slug: p.slug,
      name: p.name,
      organizationId: p.owner_organization_id,
      organizationSlug: p.org_slug,
      organizationName: p.org_name,
      memberRole: p.role,
    })),
  });
}
