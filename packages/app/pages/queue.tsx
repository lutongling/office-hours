import styled from "styled-components";
import {
  Role,
  Question,
  OpenQuestionStatus,
  ClosedQuestionStatus,
  QuestionType,
  QuestionStatus,
  UserCourse,
} from "@template/common";
import QuestionForm from "../components/Queue/QuestionForm";
import QueueList from "../components/Queue/QueueList";
import StudentPopupCard from "../components/Queue/StudentPopupCard";
import { useCallback, useState, useContext, useEffect, Fragment } from "react";
import { API } from "@template/api-client";
import { ProfileContext } from "../contexts/ProfileContextProvider";
import { useProfile } from "../hooks/useProfile";

// TODO: replace this with profile role from endpoint
const ROLE: Role = Role.TA;

const Container = styled.div`
  margin: 32px 64px;
  @media (max-width: 768px) {
    margin: 32px 24px;
  }
`;

interface QueueProps {}

export default function Queue({}: QueueProps) {
  const profile = useProfile();
  const [course, setCourse] = useState<UserCourse>(null);
  const [queueId, setQueueId] = useState<number>(null);
  const [questions, setQuestions] = useState<Question[]>([]);

  // Student queue state variables
  const [isJoining, setIsJoining] = useState<boolean>(false);
  const [questionDraftId, setQuestionDraftId] = useState<number>(null);

  // TA queue state variables
  const [openPopup, setOpenPopup] = useState<boolean>(false);
  const [helpingQuestions, setHelpingQuestions] = useState<Question[]>([]);
  const [groupQuestions, setGroupQuestions] = useState<Question[]>([]);
  const [currentQuestion, setCurrentQuestion] = useState<Question>(null);

  useEffect(() => {
    if (profile) {
      const selectedCourse: UserCourse = profile.courses[0];
      setCourse(selectedCourse);
      setQueueId(selectedCourse.course.id);
    }
  }, [profile]);

  useEffect(() => {
    if (queueId) {
      getQuestions();
    }
  }, [queueId]);

  /**
   * Gets the questions for this course
   */
  const getQuestions = async () => {
    const q = await API.questions.index(queueId);

    if (queueId && q) {
      setQuestions(q);
      let helping: Question[] = [];
      let group: Question[] = [];
      for (let question of q) {
        if (
          question.status === OpenQuestionStatus.Helping
          // question.taHelped &&
          // question.taHelped.id === profile.id
        ) {
          helping.push(question);
        } else {
          group.push(question);
        }
      }
      setHelpingQuestions(helping);
      setGroupQuestions(group);
    }
  };

  const onOpenClick = useCallback((question: Question): void => {
    setCurrentQuestion(question);
    setOpenPopup(true);
  }, []);

  const onCloseClick = useCallback((): void => {
    setCurrentQuestion(null);
    setOpenPopup(false);
  }, []);

  /**
   * Student functions to support queue operations.
   */

  /**
   * Creates a new Question draft for a student who has joined the queue.
   */
  const joinQueue = async () => {
    setIsJoining(true);

    // API call to join queue, question marked as draft
    const q = await API.questions.create(queueId, {
      text: "",
      questionType: null, // endpoint needs to be changed to allow empty questionType for drafts
    });
    if (q) {
      // fetch updated question list
      getQuestions();
      setQuestionDraftId(q.id);
    }
  };

  /**
   * Deletes existing Question draft for a student who has left the queue.
   */
  const leaveQueue = async () => {
    setIsJoining(false);

    const q = await API.questions.update(queueId, questionDraftId, {
      status: ClosedQuestionStatus.Deleted,
    });

    // fetch updated question list
    getQuestions();
    setQuestionDraftId(null);
  };

  /**
   * Finishes creating a given question by updating the draft.
   */
  const finishQuestion = async (text: string, questionType: QuestionType) => {
    const q = await API.questions.update(queueId, questionDraftId, {
      text: text,
      questionType: questionType,
      status: OpenQuestionStatus.Queued,
    });

    if (q) {
      // fetch updated question list
      getQuestions();
      setIsJoining(false);
    }
  };

  /**
   * TA functions to support queue operations
   */

  /**
   * Updates a given question to the given status.
   * @param question the question being modified
   * @param status the updated status
   */
  const updateQuestionTA = async (
    question: Question,
    status: QuestionStatus
  ) => {
    const q = await API.questions.update(queueId, question.id, {
      status: status,
    });

    if (q) {
      // fetch updated question list
      getQuestions();

      // update helping state if none left
    }
  };

  /**
   * Sends a push notification to the student with the given Question
   * @param question the question to be notified
   */
  const alertStudent = (question: Question) => {
    // Send API request to trigger notification
  };

  // Prevent queue from rendering without authentication
  if (profile) {
    return (
      <Container>
        {!isJoining && (
          <Fragment>
            <QueueList
              role={ROLE}
              onOpenClick={onOpenClick}
              joinQueue={joinQueue}
              updateQuestionTA={updateQuestionTA}
              alertStudent={alertStudent}
              questions={questions}
              helpingQuestions={helpingQuestions}
              groupQuestions={groupQuestions}
            />
            {ROLE === "ta" && currentQuestion && (
              <StudentPopupCard
                onClose={onCloseClick}
                email="takayama.a@northeastern.edu" //need a way to access this. or the user
                wait={20} //figure out later
                question={currentQuestion}
                location="Outside by the printer" // need a way to access this
                visible={openPopup}
                updateQuestion={updateQuestionTA}
              />
            )}
          </Fragment>
        )}
        {isJoining && (
          <QuestionForm
            leaveQueue={leaveQueue}
            finishQuestion={finishQuestion}
          />
        )}
      </Container>
    );
  } else {
    return null;
  }
}