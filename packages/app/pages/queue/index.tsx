import styled from "styled-components";
import { Role } from "@template/common";
import QueueList from "../../components/Queue/QueueList";
import StudentPopupCard from "../../components/Queue/StudentPopupCard";
import { useCallback, useState, useContext } from "react";
import useSWR from "swr";
import { API } from "@template/api-client";
import { ProfileContext } from "../../contexts/ProfileContextProvider";

// TODO: replace this with profile role from endpoint
const ROLE: Role = Role.TA;

const queueId: number = 169;

const Container = styled.div`
  margin: 32px 64px;
  @media (max-width: 768px) {
    margin: 32px 24px;
  }
`;

interface QueueProps {}

export default function Queue({}: QueueProps) {
  const [openPopup, setOpenPopup] = useState(false);
  const { profile } = useContext(ProfileContext);

  const { data, error } = useSWR(
    `/api/v1/queues/${queueId}/questions`,
    async () => API.questions.index(queueId)
  );

  const onOpenClick = useCallback((name: string): void => {
    setOpenPopup(true);
  }, []);

  const onCloseClick = useCallback((): void => {
    setOpenPopup(false);
  }, []);

  return (
    <Container>
      <QueueList role={ROLE} onOpenClick={onOpenClick} />
      {ROLE === "ta" && (
        <StudentPopupCard
          onClose={onCloseClick}
          name="Alex Takayama"
          email="takayama.a@northeastern.edu"
          wait={20}
          type="Concept"
          question="Help with working out how to use an accumulator for problem 1"
          location="Outside room, by the couches"
          status="WAITING"
          visible={openPopup}
        />
      )}
    </Container>
  );
}
