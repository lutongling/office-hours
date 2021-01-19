import { Role } from '@koh/common';
import { JwtService } from '@nestjs/jwt';
import { TestingModuleBuilder } from '@nestjs/testing';
import { UserCourseModel } from 'profile/user-course.entity';
import { LoginModule } from '../src/login/login.module';
import { UserModel } from '../src/profile/user.entity';
import {
  CourseFactory,
  CourseSectionFactory,
  UserCourseFactory,
  UserFactory,
} from './util/factories';
import { setupIntegrationTest } from './util/testUtils';

const mockJWT = {
  signAsync: async (payload, options?) => JSON.stringify(payload),
  verifyAsync: async (payload) => JSON.parse(payload).token !== 'INVALID_TOKEN',
  decode: (payload) => JSON.parse(payload),
};

describe('Login Integration', () => {
  const supertest = setupIntegrationTest(
    LoginModule,
    (t: TestingModuleBuilder) =>
      t.overrideProvider(JwtService).useValue(mockJWT),
  );

  describe('POST /login/entry', () => {
    it('request to entry with correct jwt payload works', async () => {
      const token = await mockJWT.signAsync({ userId: 1 });

      const res = await supertest()
        .get(`/login/entry?token=${token}`)
        .expect(302);

      expect(res.header['location']).toBe('/');
      expect(res.get('Set-Cookie')[0]).toContain('userId');
    });

    it('entry as user with courses goes to root page', async () => {
      const user = await UserFactory.create();
      const usercourse = await UserCourseFactory.create({ user: user });
      const token = await mockJWT.signAsync({ userId: user.id });

      const res = await supertest()
        .get(`/login/entry?token=${token}`)
        .expect(302);

      expect(res.header['location']).toBe('/');
      expect(res.get('Set-Cookie')[0]).toContain('userId');
    });

    it('request to entry with invalid jwt returns error', async () => {
      const token = await mockJWT.signAsync({ token: 'INVALID_TOKEN' });

      const res = await supertest()
        .get(`/login/entry?token=${token}`)
        .expect(401);
    });
  });

  describe('POST /khoury_login', () => {
    it('creates user and sends back correct redirect', async () => {
      const user = await UserModel.findOne({
        where: { email: 'stenzel.w@northeastern.edu' },
      });
      expect(user).toBeUndefined();

      const res = await supertest().post('/khoury_login').send({
        email: 'stenzel.w@northeastern.edu',
        campus: 1,
        first_name: 'Will',
        last_name: 'Stenzel',
        photo_url: 'sdf',
        courses: [],
        ta_courses: [],
      });

      // Expect that the new user has been created
      const newUser = await UserModel.findOne({
        where: { email: 'stenzel.w@northeastern.edu' },
      });
      expect(newUser).toBeDefined();

      // And that the redirect is correct
      expect(res.body).toEqual({
        redirect: 'http://localhost:3000/api/v1/login/entry?token={"userId":1}',
      });
    });

    describe('with course mapping', () => {
      let course;
      beforeEach(async () => {
        // Make course mapping so usercourse can be added
        course = await CourseFactory.create({
          name: 'CS 2510 Accelerated',
        });
        await CourseSectionFactory.create({
          genericCourseName: 'CS 2510',
          section: 1,
          course: course,
        });
      });
      it('overwrites courses but not names of existing users', async () => {
        let user = await UserFactory.create();

        const res = await supertest()
          .post('/khoury_login')
          .send({
            email: user.email,
            campus: 1,
            first_name: 'Will',
            last_name: 'Stenzel',
            photo_url: 'sdf',
            courses: [
              {
                course: 'CS 2510',
                crn: 12345,
                accelerated: false,
                section: 1,
                semester: '000',
                title: 'Fundamentals of Computer Science II',
              },
            ],
            ta_courses: [],
          })
          .expect(201);
        user = await UserModel.findOne(user, { relations: ['courses'] });

        expect(user.courses).toHaveLength(1);
        expect(user.firstName).not.toEqual('Will');
      });

      it('handles student courses and sections correctly', async () => {
        const res = await supertest()
          .post('/khoury_login')
          .send({
            email: 'stenzel.w@northeastern.edu',
            campus: 1,
            first_name: 'Will',
            last_name: 'Stenzel',
            photo_url: 'sdf',
            courses: [
              {
                course: 'CS 2510',
                crn: 12345,
                accelerated: false,
                section: 1,
                semester: '000',
                title: 'Fundamentals of Computer Science II',
              },
            ],
            ta_courses: [],
          })
          .expect(201);

        const student = await UserModel.findOne({
          where: { email: 'stenzel.w@northeastern.edu' },
          relations: ['courses'],
        });

        expect(student.courses).toHaveLength(1);
        expect(student.courses[0].id).toBe(course.id);
      });

      /*it('deletes stale user course if no longer valid', async () => {
        await supertest()
          .post('/khoury_login')
          .send({
            email: 'stenzel.w@northeastern.edu',
            campus: 1,
            first_name: 'Will',
            last_name: 'Stenzel',
            photo_url: '',
            courses: [
              {
                course: 'CS 2510',
                crn: 12345,
                accelerated: false,
                section: 1,
                semester: '000',
                title: 'Fundamentals of Computer Science II',
              },
            ],
            ta_courses: [],
          })
          .expect(201);

        const user = await UserModel.findOne({
          where: { email: 'stenzel.w@northeastern.edu' },
          relations: ['courses'],
        });

        const fundiesUserCourse = await UserCourseModel.findOne({
          where: { userId: user.id },
        });
        expect(fundiesUserCourse).toEqual({
          courseId: 1,
          id: 1,
          role: 'student',
          userId: 1,
        });

        const totalUserCourses = await UserCourseModel.count();
        expect(totalUserCourses).toEqual(1);

        // After dropping fundies II, user logs in again
        await supertest()
          .post('/khoury_login')
          .send({
            email: 'stenzel.w@northeastern.edu',
            campus: 1,
            first_name: 'Will',
            last_name: 'Stenzel',
            photo_url: '',
            courses: [],
            ta_courses: [],
          })
          .expect(201);

        const noUserCourse = await UserCourseModel.findOne(
          fundiesUserCourse.id,
        );
        expect(noUserCourse).toBeUndefined();

        const totalUserCoursesUpdated = await UserCourseModel.count();
        expect(totalUserCoursesUpdated).toEqual(0);
      });
      */
    });

    const setupTAAndProfessorCourses = async () => {
      const regularFundies = await CourseFactory.create({
        name: 'CS 2500 Regular',
      });
      const acceleratedFundies = await CourseFactory.create({
        name: 'CS 2500 Accelerated',
      });
      const onlineFundies = await CourseFactory.create({
        name: 'CS 2500 Online',
      });
      await CourseSectionFactory.create({
        genericCourseName: 'CS 2500',
        section: 1,
        course: regularFundies,
      });
      await CourseSectionFactory.create({
        genericCourseName: 'CS 2500',
        section: 3,
        course: acceleratedFundies,
      });
      await CourseSectionFactory.create({
        genericCourseName: 'CS 2500',
        section: 2,
        course: onlineFundies,
      });
    };

    it('handles TA courses correctly', async () => {
      await setupTAAndProfessorCourses();

      const res = await supertest()
        .post('/khoury_login')
        .send({
          email: 'stenzel.w@northeastern.edu',
          campus: 1,
          first_name: 'Will',
          last_name: 'Stenzel',
          photo_url: 'sdf',
          courses: [],
          ta_courses: [
            {
              course: 'CS 2500',
              semester: '000',
            },
          ],
        })
        .expect(201);

      const ta = await UserModel.findOne({
        where: { email: 'stenzel.w@northeastern.edu' },
        relations: ['courses'],
      });

      // Expect the ta to have been all three courses accosiated with the given generic courses (CS 2500)
      expect(ta.courses).toHaveLength(3);
    });

    it.only('handles professor courses correctly', async () => {
      await setupTAAndProfessorCourses();

      const res = await supertest()
        .post('/khoury_login')
        .send({
          email: 'stenzel.w@northeastern.edu',
          campus: 1,
          first_name: 'Will',
          last_name: 'Stenzel',
          photo_url: 'sdf',
          courses: [],
          ta_courses: [
            {
              course: 'CS 2500',
              semester: '000',
              instructor: 1,
            },
          ],
        })
        .expect(201);

      const professor = await UserModel.findOne({
        where: { email: 'stenzel.w@northeastern.edu' },
        relations: ['courses'],
      });

      const ucms = await UserCourseModel.find({
        where: { user: professor },
      });

      // Expect the professor to have been all three courses accosiated with the given generic courses (CS 2500)
      expect(professor.courses).toHaveLength(3);
      expect(ucms.every((ucm) => ucm.role === Role.PROFESSOR)).toBeTruthy();
    });
  });

  describe('GET /logout', () => {
    it('makes sure logout endpoint is destroying cookies like a mob boss', async () => {
      const res = await supertest().get(`/logout`).expect(302);
      expect(res.header['location']).toBe('/login');
      expect(res.get('Set-Cookie')[0]).toContain('auth_token=;');
    });
  });
});
