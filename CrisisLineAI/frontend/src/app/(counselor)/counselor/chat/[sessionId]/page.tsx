type SessionChatPageProps = {
	params: Promise<{
		sessionId: string;
	}>;
};

export default async function SessionChatPage({ params }: SessionChatPageProps) {
	const { sessionId } = await params;

	return <main>Chat session: {sessionId}</main>;
}
