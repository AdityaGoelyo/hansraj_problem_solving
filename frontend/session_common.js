async function loadData() {
    const { data: { user } } = await client.auth.getUser();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const { data: session, error: sessionError } = await client.from('sessions').select('*').eq('id', sessionId).single();
    const { data: sessionProblems } = await client.from('session_problems').select('*, problems(*)').eq('session_id', sessionId).order('position');
    let current_problem_number = session.current_problem_number;
    let now = new Date().toISOString();
    return { user, params, session, sessionId, sessionProblems, current_problem_number, now };
}

async function getHighestAttemptNumber(user, sessionProblems, current_problem_number) {
    let {data : PreviousAttemptNumber} = await client.from('attempts')
    .select('attempt_number')
    .eq('solver_id',user.id)
    .eq('problem_id', sessionProblems[current_problem_number].problems.id)
    .order('attempt_number', {ascending: false})
    .limit(1);

    let HighestAttemptNumber = PreviousAttemptNumber.length ? PreviousAttemptNumber[0].attempt_number : 0; 
    return HighestAttemptNumber
}

async function upload_attempt_number_to_session_attempts(sessionId, user, params, now) {
    session_attempt_id = crypto.randomUUID();
    await client.from('session_attempts').insert({
        'id': session_attempt_id,
        'session_id': sessionId,
        'solver_id': user.id,
        'attempt_number': parseInt(params.get('attempt'), 10),
        'started_at': now
    });
}

function render_problem_title_id_and_counter(sessionProblems, current_problem_number){
    const problem_counter = document.getElementById("problem_counter");
    const total_num_problems = Math.max(...sessionProblems.map(item => item.position));
    problem_counter.textContent = `Current Problem Number: ${current_problem_number + 1}/${total_num_problems + 1}`;

    const current_problem_title = document.getElementById("current_problem_title");
    current_problem_title.textContent = sessionProblems[current_problem_number].problems.title;

    const current_problem_id = document.getElementById("current_problem_id");
    current_problem_id.textContent = `Problem Id: ${sessionProblems[current_problem_number].problems.id}`;

    return {problem_counter, total_num_problems, current_problem_title, current_problem_id}
}

function showAnswerBlock(problemType) {
    document.getElementById('proof_block').classList.add('hidden');
    document.getElementById('integer_block').classList.add('hidden');
    document.getElementById('mcq_block').classList.add('hidden');

    if (problemType === 'proof') {
        document.getElementById('proof_block').classList.remove('hidden');
    } else if (problemType === 'integer') {
        document.getElementById('integer_block').classList.remove('hidden');
    } else if (problemType === 'mcq') {
        document.getElementById('mcq_block').classList.remove('hidden');
    }
}