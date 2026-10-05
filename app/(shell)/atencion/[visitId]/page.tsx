import { AttentionPage } from "../../../../src/views/WorkspacePage";
export default async function AttentionRoute({ params }: { params: Promise<{ visitId: string }> }) { const { visitId } = await params; return <AttentionPage visitId={visitId} />; }
