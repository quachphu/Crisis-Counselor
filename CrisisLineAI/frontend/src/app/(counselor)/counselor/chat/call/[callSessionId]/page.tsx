type CallPageProps = {
	params: Promise<{
		callSessionId: string;
	}>;
};

export default async function CallPage({ params }: CallPageProps) {
	const { callSessionId } = await params;

	return <main>Call session: {callSessionId}</main>;
}
