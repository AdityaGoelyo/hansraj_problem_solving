async function loadData() {
    const { data: { user } } = await client.auth.getUser();
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get('session');
    const { data: session, error: sessionError } = await client.from('sessions').select('*').eq('id', sessionId).single();
    const { data: sessionProblems } = await client.from('session_problems').select('*, problems(*)').eq('session_id', sessionId).order('position');
    let current_problem_number = session.current_problem_number;
    let now = new Date().toISOString();
    const total_num_problems = Math.max(...sessionProblems.map(item => item.position));
    return { user, params, session, sessionId, sessionProblems, current_problem_number, now, total_num_problems};
}

async function getHighestAttemptNumber(user, sessionProblems, current_problem_number) {
    let {data : PreviousAttemptNumber} = await client.from('attempts')
    .select('attempt_number')
    .eq('solver_id',user.id)
    .eq('problem_id', sessionProblems[current_problem_number].problems.id)
    .order('attempt_number', {ascending: false})
    .limit(1);

    let HighestAttemptNumber = PreviousAttemptNumber.length ? PreviousAttemptNumber[0].attempt_number : 0; 
    return HighestAttemptNumber;
}

async function upload_attempt_number_to_session_attempts(user, sessionId, params, now) {
    let { data:existingAttempt, error } = await client.from('session_attempts').select('*').eq('session_id', sessionId).eq('solver_id', user.id).eq('attempt_number', parseInt(params.get('attempt'), 10)).maybeSingle();
    let session_attempt_id;
    let current_problem_number;
    if (existingAttempt) {
        session_attempt_id = existingAttempt.id;
        current_problem_number = existingAttempt.current_problem_number;
    } else {
        session_attempt_id = crypto.randomUUID();
        await client.from('session_attempts').upsert({
            'id': session_attempt_id,
            'session_id': sessionId,
            'solver_id': user.id,
            'attempt_number': parseInt(params.get('attempt'), 10),
            'started_at': now
        });
        current_problem_number = 0;
    }
    console.log(current_problem_number);
    return {session_attempt_id, current_problem_number};
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

function markAsSubmitted(buttonEl) { 
    buttonEl.disabled = true;
    buttonEl.classList.remove('nav_button');
    buttonEl.classList.add('dead_button');
 }

function markAsNotSubmitted(buttonEl) { 
    buttonEl.disabled = false;
    buttonEl.classList.add('nav_button');
    buttonEl.classList.remove('dead_button');
}
 
async function refresh_answer_fields(proof_based_answer_button, isProved, problemStartedAt, problemEndedAt, sessionProblems, current_problem_number, mcq_options, mcq_submit, integer_submit){

    // reset proof values
    proof_based_answer_button.classList.remove('selected');
    isProved = false;
    problemStartedAt = new Date();
    problemEndedAt = new Date();

    // load mcq options
    if (sessionProblems[current_problem_number].problems.problem_type == 'mcq') {
        mcq_options.replaceChildren();
        markAsNotSubmitted(mcq_submit);
        let { data: options , error: optionsError } = await client.from('solutions')
            .select('*')
            .eq('problem_id', sessionProblems[current_problem_number].problems.id)
            .eq('canon', true);

        for (const option of options) {
            const cell = document.createElement('button');
            cell.className = 'subcell nav_button';
            cell.innerHTML = option.statement_html;
            cell.addEventListener('click', async function click() {
                const previouslySelected = mcq_options.querySelector('.selected');
                if (previouslySelected) previouslySelected.classList.remove('selected');
                cell.classList.add('selected');
            });
            mcq_options.appendChild(cell)
        }
    } else if (sessionProblems[current_problem_number].problems.problem_type == 'integer') {
        integer_submit.disabled = false;
        integer_submit.classList.remove('dead_button');
        integer_submit.classList.add('nav_button');
    }
    return { isProved, problemStartedAt, problemEndedAt };
}

async function submit_mcq_answer(mcq_submit, mcq_options, user, sessionProblems, current_problem_number, sessionId, solution_id, HighestAttemptNumber, problemStartedAt, problemEndedAt, session_attempt_id) {
    solution_id = crypto.randomUUID();
    markAsSubmitted(mcq_submit);
    const selectedOption = mcq_options.querySelector('.selected');
    const answer_text = selectedOption.statement_text;
    const answer_html = selectedOption.statement_html;
    await client.from('solutions').insert({
        'id' : solution_id, 
        'solver_id' : user.id,
        'problem_id' : sessionProblems[current_problem_number].problems.id,
        'canon' : false,
        'statement_text' : answer_text,
        'statement_html' : answer_html
    });
    await client.from('attempts').insert({
        'solver_id':user.id,
        'problem_id':sessionProblems[current_problem_number].problems.id,
        'session_id':sessionId,
        'solution_id': solution_id,
        'attempt_number':HighestAttemptNumber+1, // correct this to a more dynamic number later
        'time_taken_seconds': Math.round((problemEndedAt - problemStartedAt) / 1000), // time taken in seconds
        'session_attempt_id': session_attempt_id
    });
}

async function submit_integer_answer(integer_submit, user, sessionProblems, current_problem_number, sessionId, HighestAttemptNumber, problemStartedAt, problemEndedAt, session_attempt_id) {
    solution_id = crypto.randomUUID();
    markAsSubmitted(integer_submit);
    await client.from('solutions').insert({
        'id' : solution_id, 
        'solver_id' : user.id,
        'problem_id' : sessionProblems[current_problem_number].problems.id,
        'canon' : false,
        'statement_text' : document.getElementById('integer_answer_input').value
    });
    await client.from('attempts').insert({
        'solver_id':user.id,
        'problem_id':sessionProblems[current_problem_number].problems.id,
        'session_id':sessionId,
        'solution_id': solution_id,
        'attempt_number':HighestAttemptNumber+1, // correct this to a more dynamic number later
        'time_taken_seconds': Math.round((problemEndedAt - problemStartedAt) / 1000), // time taken in seconds
        'session_attempt_id': session_attempt_id
    });
}

function define_const_elements() {
    const proof_block = document.getElementById('proof_block');            
    const mcq_options = document.getElementById("mcq_options");
    const mcq_submit = document.getElementById('mcq_submit');
    const integer_block = document.getElementById('integer_block');
    const integer_submit = document.getElementById('integer_submit');
    const proof_based_answer_button = document.getElementById("proof_based_answer_button");
    const webpage_title = document.getElementById("webpage_title");
    const sessionTitle = document.getElementById("sessionTitle");
    const current_problem_data = document.getElementById("current_problem_data");
    const problem_counter = document.getElementById("problem_counter");
    const current_problem_title = document.getElementById("current_problem_title");
    const current_problem_id = document.getElementById("current_problem_id");

    return {proof_block, mcq_options, mcq_submit, integer_block, integer_submit, proof_based_answer_button, webpage_title, sessionTitle, current_problem_data, problem_counter, current_problem_title, current_problem_id};
}

function define_let_variables() {
    let answer_text = ""
    let answer_html = ""
    let solution_id = crypto.randomUUID();
    let problemStartedAt = new Date();
    let problemEndedAt = new Date();
    let isProved = false;
    let previousProblemNumber;

    return {answer_text, answer_html, solution_id, problemStartedAt, problemEndedAt, isProved, previousProblemNumber};
}

function update_problem_in_frontend(current_problem_number, payload, problem_counter, current_problem_title, current_problem_data, current_problem_id, sessionProblems, total_num_problems, previousProblemNumber) {
    previousProblemNumber = current_problem_number;
    current_problem_number = payload.new.current_problem_number;
    problem_counter.textContent = `Current Problem Number: ${current_problem_number + 1}/${total_num_problems + 1}`;
    current_problem_title.textContent = sessionProblems[current_problem_number].problems.title;
    current_problem_data.innerHTML = sessionProblems[current_problem_number].problems.statement_html;
    current_problem_id.textContent = `Problem Id: ${sessionProblems[current_problem_number].problems.id}`;

    return {previousProblemNumber, current_problem_number};
}

async function submit_proof_answer(isProved, user, sessionProblems, problemNumber, sessionId, HighestAttemptNumber, problemEndedAt, problemStartedAt, session_attempt_id) {
    if (isProved == false) problemEndedAt = new Date();
    const error = await client.from('attempts').insert({
        'solver_id':user.id,
        'problem_id':sessionProblems[problemNumber].problems.id,
        'session_id':sessionId,
        'attempt_number':HighestAttemptNumber + 1,
        'is_correct':isProved,
        'time_taken_seconds': Math.round((problemEndedAt - problemStartedAt) / 1000), // time taken in seconds
        'session_attempt_id': session_attempt_id
    });
    if (error) console.error(error);
}