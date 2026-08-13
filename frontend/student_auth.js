async function isLoggedIn() {
    const { data: { user } } = await client.auth.getUser();
    if (!user) {
        if (confirm('Please log in to access this page. Go to login now?')) {
            window.location.href = 'student_login.html';
        }
    }
}