describe("Student can edit their question", () => {
    beforeEach(() => {
      // Set the state
      cy.request("POST", "/api/v1/seeds/createUser", { role: "student" })
        .then((res) => res.body)
        .as("student");
      cy.get("@student").then((student) => {
          // Login the student
          cy.visit(`/api/v1/profile/entry?userId=${student.user.id}`);
  
          // Create a queue
          cy.request("POST", "/api/v1/seeds/createQueue", { courseId: student.course.id }).then((res) => res.body).as("queue");
          
          // Create a question for the student   // TODO: This could be done through the /seeds/createQuestion endpoint with a little modification
          cy.get("@queue").then((queue) => {
              cy.request("POST", "/api/v1/questions", {
                  text: "Test question text",
                  queueId: queue.id,
                  questionType: "Bug",
                  isOnline: false,
                  location: "Outside room, by the couches",
              }).then((res) => res.body).then((question) => {
                  cy.request("PATCH", `/api/v1/questions/${question.id}`, {
                      status: "Queued"
                  })
              })
          });
      });
  });
      it("from the queue page", () => {
      // Visit the queue page
      cy.get("@queue").then((queue) =>
        cy.visit(`/course/${queue.courseId}/queue/${queue.id}`)
      );

    // Click the Edit Question button

    // Edit the question in the modal

    // Click Submit

    // See that the question is updated on the page

    });
  });
  