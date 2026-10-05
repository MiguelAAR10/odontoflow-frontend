import { VisitRecordPage } from "../../../../src/views/WorkspacePage";
export default async function VisitRoute({ params }: { params: Promise<{ id: string }> }) { const { id } = await params; return <VisitRecordPage visitId={id} />; }
