import {
  ERROR_MESSAGES,
  TACheckinPair,
  TACheckinTimesResponse,
  RegisterCourseParams,
  Role,
} from '@koh/common';
import {
  HttpException,
  HttpStatus,
  Injectable,
  BadRequestException,
} from '@nestjs/common';
import { partition } from 'lodash';
import { EventModel, EventType } from 'profile/event-model.entity';
import { QuestionModel } from 'question/question.entity';
import { Between, Connection, In } from 'typeorm';
import { UserCourseModel } from '../profile/user-course.entity';
import { SemesterModel } from 'semester/semester.entity';
import { ProfSectionGroupsModel } from 'login/prof-section-groups.entity';
import { CourseSectionMappingModel } from 'login/course-section-mapping.entity';
import { LastRegistrationModel } from 'login/last-registration-model.entity';
import { LoginCourseService } from '../login/login-course.service';
import { CourseModel } from './course.entity';

@Injectable()
export class CourseService {
  constructor(
    private connection: Connection,
    private loginCourseService: LoginCourseService,
  ) {}

  async getTACheckInCheckOutTimes(
    courseId: number,
    startDate: string,
    endDate: string,
  ): Promise<TACheckinTimesResponse> {
    const startDateAsDate = new Date(startDate);
    const endDateAsDate = new Date(endDate);
    if (startDateAsDate.getUTCDate() === endDateAsDate.getUTCDate()) {
      endDateAsDate.setUTCDate(endDateAsDate.getUTCDate() + 1);
    }

    const taEvents = await EventModel.find({
      where: {
        eventType: In([
          EventType.TA_CHECKED_IN,
          EventType.TA_CHECKED_OUT,
          EventType.TA_CHECKED_OUT_FORCED,
        ]),
        time: Between(startDateAsDate, endDateAsDate),
        courseId,
      },
      relations: ['user'],
    });

    const [checkinEvents, otherEvents] = partition(
      taEvents,
      (e) => e.eventType === EventType.TA_CHECKED_IN,
    );

    const taCheckinTimes: TACheckinPair[] = [];

    for (const checkinEvent of checkinEvents) {
      let closestEvent: EventModel = null;
      let mostRecentTime = new Date();
      const originalDate = mostRecentTime;

      for (const checkoutEvent of otherEvents) {
        if (
          checkoutEvent.userId === checkinEvent.userId &&
          checkoutEvent.time > checkinEvent.time &&
          checkoutEvent.time.getTime() - checkinEvent.time.getTime() <
            mostRecentTime.getTime() - checkinEvent.time.getTime()
        ) {
          closestEvent = checkoutEvent;
          mostRecentTime = checkoutEvent.time;
        }
      }

      const numHelped = await QuestionModel.count({
        where: {
          taHelpedId: checkinEvent.userId,
          helpedAt: Between(
            checkinEvent.time,
            closestEvent?.time || new Date(),
          ),
        },
      });

      taCheckinTimes.push({
        name: checkinEvent.user.name,
        checkinTime: checkinEvent.time,
        checkoutTime: closestEvent?.time,
        inProgress: mostRecentTime === originalDate,
        forced: closestEvent?.eventType === EventType.TA_CHECKED_OUT_FORCED,
        numHelped,
      });
    }

    return { taCheckinTimes };
  }
  async removeUserFromCourse(userCourse: UserCourseModel): Promise<void> {
    if (!userCourse) {
      throw new HttpException(
        ERROR_MESSAGES.courseController.courseNotFound,
        HttpStatus.NOT_FOUND,
      );
    }
    try {
      await UserCourseModel.remove(userCourse);
    } catch (err) {
      console.error(err);
      throw new HttpException(
        ERROR_MESSAGES.courseController.removeCourse,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  async registerCourses(
    body: RegisterCourseParams[],
    userId: number,
  ): Promise<void> {
    // obtains the ProfSectionGroupsModel of the professor
    const profSectionGroups = await ProfSectionGroupsModel.findOne({
      where: { profId: userId },
    });

    // iterate over each section group registration
    for (const courseParams of body) {
      // finds professor's section group with matching name
      const sectionGroup = profSectionGroups?.sectionGroups.find(
        (sg) => sg.name === courseParams.sectionGroupName,
      );
      if (!sectionGroup)
        throw new BadRequestException(
          ERROR_MESSAGES.courseController.sectionGroupNotFound,
        );
      const khourySemesterParsed = this.loginCourseService.parseKhourySemester(
        sectionGroup.semester,
      );
      const semester = await SemesterModel.findOne({
        where: {
          season: khourySemesterParsed.season,
          year: khourySemesterParsed.year,
        },
      });
      if (!semester)
        throw new BadRequestException(
          ERROR_MESSAGES.courseController.noSemesterFound,
        );

      // checks that course hasn't already been created
      let course = await CourseModel.findOne({
        where: {
          sectionGroupName: courseParams.sectionGroupName,
          semesterId: semester.id,
        },
      });
      if (course)
        throw new BadRequestException(
          ERROR_MESSAGES.courseController.courseAlreadyRegistered,
          courseParams.name,
        );

      try {
        // create the submitted course
        course = await CourseModel.create({
          name: courseParams.name,
          sectionGroupName: courseParams.sectionGroupName,
          coordinator_email: courseParams.coordinator_email,
          icalURL: courseParams.iCalURL,
          semesterId: semester.id,
          enabled: true,
          timezone: courseParams.timezone,
        }).save();
      } catch (err) {
        console.error(err);
        throw new HttpException(
          ERROR_MESSAGES.courseController.createCourse,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      try {
        // create CourseSectionMappings for each crn
        new Set(sectionGroup.crns).forEach(async (crn) => {
          await CourseSectionMappingModel.create({
            crn: crn,
            courseId: course.id,
          }).save();
        });
      } catch (err) {
        console.error(err);
        throw new HttpException(
          ERROR_MESSAGES.courseController.createCourseMappings,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }

      // Add UserCourse to course
      await UserCourseModel.create({
        userId,
        courseId: course.id,
        role: Role.PROFESSOR,
      }).save();
    }

    try {
      // Update professor's last registered semester to semester model's current semester
      let profLastRegistered: LastRegistrationModel;
      profLastRegistered = await LastRegistrationModel.findOne({
        where: { profId: userId },
      });

      const lastRegisteredSemester =
        profSectionGroups?.sectionGroups[0]?.semester;

      if (profLastRegistered) {
        profLastRegistered.lastRegisteredSemester = lastRegisteredSemester;
        await profLastRegistered.save();
      } else {
        profLastRegistered = await LastRegistrationModel.create({
          profId: userId,
          lastRegisteredSemester,
        }).save();
      }
    } catch (err) {
      console.error(err);
      throw new HttpException(
        ERROR_MESSAGES.courseController.updateProfLastRegistered,
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
